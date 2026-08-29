-- ============================================================================
-- Personal Khata & Household Expense Manager — Supabase Schema
-- Run the whole file in the Supabase SQL Editor (or `supabase db push`).
-- Safe to re-run: every statement is idempotent.
--
-- SECURITY MODEL (CRITICAL):
--   * Every user-owned table is keyed by `user_id uuid not null
--     references auth.users(id) on delete cascade`.
--   * Row Level Security is ENABLED and FORCED on every user-owned table.
--   * Policies ONLY match `auth.uid() = user_id`, so a user can never read or
--     write another user's data — even with a direct SQL query.
--   * The server action layer additionally resolves user_id from the verified
--     session (never from client input) before every mutation.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1) USER SETTINGS
-- ============================================================================
create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  currency_code      text not null default 'PKR',
  currency_symbol    text not null default 'Rs.',
  theme              text not null default 'system',
  week_starts_on     int  not null default 1,
  default_account_id uuid,
  notify_bills       boolean not null default true,
  notify_budgets     boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.user_settings add column if not exists theme text not null default 'system';
alter table public.user_settings add column if not exists week_starts_on int not null default 1;
alter table public.user_settings add column if not exists default_account_id uuid;
alter table public.user_settings add column if not exists notify_bills boolean not null default true;
alter table public.user_settings add column if not exists notify_budgets boolean not null default true;

comment on table public.user_settings is 'Per-user preferences (currency, theme, defaults).';

-- ============================================================================
-- 2) CATEGORIES  (type: expense | income)
-- ============================================================================
create table if not exists public.categories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  color       text,
  type        text not null check (type in ('expense','income')),
  parent_id   uuid references public.categories(id) on delete cascade,
  is_archived boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_categories_user on public.categories (user_id);
create index if not exists idx_categories_user_type on public.categories (user_id, type, is_archived);

-- ============================================================================
-- 3) SUBCATEGORIES  (each belongs to exactly one category)
-- ============================================================================
create table if not exists public.subcategories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null,
  icon        text,
  is_archived boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_subcategories_user on public.subcategories (user_id);
create index if not exists idx_subcategories_cat on public.subcategories (category_id);

-- ============================================================================
-- 4) ACCOUNTS (cash, bank, card, wallet, savings)
-- ============================================================================
create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null default 'cash',
  opening_balance numeric(14,2) not null default 0,
  currency_code   text not null default 'PKR',
  icon            text,
  color           text,
  is_default      boolean not null default false,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.accounts add column if not exists is_default boolean not null default false;
create index if not exists idx_accounts_user on public.accounts (user_id, is_archived);

-- ============================================================================
-- 5) PAYMENT METHODS
-- ============================================================================
create table if not exists public.payment_methods (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_payment_methods_user on public.payment_methods (user_id);

-- ============================================================================
-- 6) VENDORS
-- ============================================================================
create table if not exists public.vendors (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vendors_user on public.vendors (user_id);

-- ============================================================================
-- 7) TAGS
-- ============================================================================
create table if not exists public.tags (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_tags_user on public.tags (user_id);

-- ============================================================================
-- 8) TRANSACTIONS (core table)
--    type: expense | income | transfer   (transfer is NEVER income/expense)
-- ============================================================================
create table if not exists public.transactions (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  type                   text not null check (type in ('expense','income','transfer')),
  amount                 numeric(14,2) not null check (amount >= 0),
  currency_code          text not null default 'PKR',
  category_id            uuid references public.categories(id) on delete set null,
  subcategory_id         uuid references public.subcategories(id) on delete set null,
  account_id             uuid references public.accounts(id) on delete set null,
  transfer_to_account_id uuid references public.accounts(id) on delete set null,
  payment_method_id      uuid references public.payment_methods(id) on delete set null,
  vendor_id              uuid references public.vendors(id) on delete set null,
  note                   text,
  qty                    numeric(12,3),
  unit_price             numeric(14,2),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  transaction_date       timestamptz not null default now(),
  is_recurring           boolean not null default false,
  is_recurring_rule_id   uuid
);
alter table public.transactions add column if not exists subcategory_id uuid references public.subcategories(id) on delete set null;
alter table public.transactions add column if not exists qty numeric(12,3);
alter table public.transactions add column if not exists unit_price numeric(14,2);
alter table public.transactions add column if not exists updated_at timestamptz not null default now();

-- A transfer must name a destination account, and it must differ from the source.
alter table public.transactions drop constraint if exists transfer_needs_target;
alter table public.transactions add constraint transfer_needs_target
  check (type <> 'transfer' or transfer_to_account_id is not null) not valid;
alter table public.transactions drop constraint if exists transfer_distinct_accounts;
alter table public.transactions add constraint transfer_distinct_accounts
  check (type <> 'transfer' or account_id is distinct from transfer_to_account_id) not valid;

create index if not exists idx_transactions_user_date on public.transactions (user_id, transaction_date desc);
create index if not exists idx_transactions_user_type_date on public.transactions (user_id, type, transaction_date desc);
create index if not exists idx_transactions_user_category on public.transactions (user_id, category_id);
create index if not exists idx_transactions_user_account on public.transactions (user_id, account_id);
create index if not exists idx_transactions_user_vendor on public.transactions (user_id, vendor_id);
create index if not exists idx_transactions_rule on public.transactions (is_recurring_rule_id);

-- ============================================================================
-- 9) COMMON CHOICES (remembers frequent picks to power quick-add)
-- ============================================================================
create table if not exists public.common_choices (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  category_id       uuid references public.categories(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  account_id        uuid references public.accounts(id) on delete set null,
  usage_count       int not null default 1,
  last_used_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_common_choices_user on public.common_choices (user_id, usage_count desc);

-- NULLS NOT DISTINCT so a null payment_method still de-duplicates (PG 15+).
alter table public.common_choices drop constraint if exists common_choices_user_id_category_id_payment_method_id_key;
drop index if exists public.common_choices_unique_idx;
create unique index common_choices_unique_idx
  on public.common_choices (user_id, category_id, payment_method_id) nulls not distinct;

-- ============================================================================
-- 10) BUDGETS (per category, per period)
-- ============================================================================
create table if not exists public.budgets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  amount       numeric(14,2) not null check (amount > 0),
  period       text not null default 'monthly' check (period in ('monthly','weekly','yearly')),
  category_id  uuid references public.categories(id) on delete cascade,
  account_id   uuid references public.accounts(id) on delete set null,
  starts_on    date not null default current_date,
  is_active    boolean not null default true,
  alert_at_pct int not null default 80,
  meta         jsonb,
  created_at   timestamptz not null default now()
);
alter table public.budgets add column if not exists is_active boolean not null default true;
alter table public.budgets add column if not exists alert_at_pct int not null default 80;
create index if not exists idx_budgets_user on public.budgets (user_id, is_active);

-- ============================================================================
-- 11) RECURRING RULES (bills / subscriptions / salary)
-- ============================================================================
create table if not exists public.recurring_rules (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text,
  amount             numeric(14,2) not null check (amount >= 0),
  type               text not null default 'expense' check (type in ('expense','income')),
  category_id        uuid references public.categories(id) on delete set null,
  account_id         uuid references public.accounts(id) on delete set null,
  payment_method_id  uuid references public.payment_methods(id) on delete set null,
  vendor_id          uuid references public.vendors(id) on delete set null,
  note               text,
  frequency          text not null check (frequency in ('daily','weekly','monthly','yearly','custom')),
  interval_step      int not null default 1 check (interval_step > 0),
  day_of_month       int,
  day_of_week        int,
  next_run           date,
  auto_post          boolean not null default true,
  remind_days_before int not null default 1,
  is_active          boolean not null default true,
  last_generated_at  timestamptz,
  created_at         timestamptz not null default now()
);
alter table public.recurring_rules add column if not exists title text;
alter table public.recurring_rules add column if not exists auto_post boolean not null default true;
alter table public.recurring_rules add column if not exists remind_days_before int not null default 1;
create index if not exists idx_recurring_user on public.recurring_rules (user_id, is_active, next_run);

alter table public.transactions drop constraint if exists fk_tx_rule;
alter table public.transactions
  add constraint fk_tx_rule foreign key (is_recurring_rule_id)
  references public.recurring_rules(id) on delete set null;

-- ============================================================================
-- 12) SHOPPING LISTS + ITEMS
-- ============================================================================
create table if not exists public.shopping_lists (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Shopping list',
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_shopping_lists_user on public.shopping_lists (user_id, is_archived);

create table if not exists public.shopping_items (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  list_id        uuid references public.shopping_lists(id) on delete cascade,
  name           text not null,
  category_id    uuid references public.categories(id) on delete set null,
  qty            numeric(12,3),
  unit           text,
  est_price      numeric(14,2),
  priority       text not null default 'normal',
  purchased      boolean not null default false,
  purchased_at   timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.shopping_items add column if not exists list_id uuid references public.shopping_lists(id) on delete cascade;
alter table public.shopping_items add column if not exists priority text not null default 'normal';
alter table public.shopping_items add column if not exists purchased_at timestamptz;
alter table public.shopping_items add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
create index if not exists idx_shopping_user on public.shopping_items (user_id, purchased);

-- ============================================================================
-- 13) KHATA — people, entries (lend/borrow), partial payments
-- ============================================================================
create table if not exists public.khata_people (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  phone      text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_khata_people_user on public.khata_people (user_id);
create unique index if not exists khata_people_unique_name on public.khata_people (user_id, lower(name));

create table if not exists public.khata_entries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   uuid references public.khata_people(id) on delete cascade,
  person_name text not null,
  direction   text not null check (direction in ('owing','owed')),
              -- 'owing' = user owes them (borrowed) ; 'owed' = they owe user (lent)
  amount      numeric(14,2) not null default 0 check (amount >= 0),
  note        text,
  entry_date  date not null default current_date,
  due_date    date,
  status      text not null default 'open' check (status in ('open','partially_paid','settled')),
  created_at  timestamptz not null default now()
);
alter table public.khata_entries add column if not exists person_id uuid references public.khata_people(id) on delete cascade;
alter table public.khata_entries add column if not exists entry_date date not null default current_date;
alter table public.khata_entries add column if not exists due_date date;
create index if not exists idx_khata_user on public.khata_entries (user_id, status);
create index if not exists idx_khata_person on public.khata_entries (person_id);

create table if not exists public.khata_payments (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  khata_entry_id uuid not null references public.khata_entries(id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  paid_at        timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_khata_payments_entry on public.khata_payments (khata_entry_id);

-- ============================================================================
-- 14) RECEIPTS
--
-- Images live in Cloudinary, uploaded as `type: authenticated` so they are NOT
-- publicly reachable — the app mints short-lived signed URLs on the server.
-- `public_id` is the Cloudinary identifier; `storage_path` is the older
-- Supabase Storage column, kept in sync so existing rows still resolve.
-- ============================================================================
create table if not exists public.receipts (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  provider       text not null default 'cloudinary',
  public_id      text,
  resource_type  text not null default 'image',
  format         text,
  storage_path   text not null,
  display_name   text,
  mime_type      text,
  size_bytes     bigint,
  ocr_text       text,
  ocr_data       jsonb,
  created_at     timestamptz not null default now()
);
alter table public.receipts add column if not exists ocr_data jsonb;
alter table public.receipts add column if not exists provider text not null default 'cloudinary';
alter table public.receipts add column if not exists public_id text;
alter table public.receipts add column if not exists resource_type text not null default 'image';
alter table public.receipts add column if not exists format text;
create index if not exists idx_receipts_transaction on public.receipts (transaction_id);
create index if not exists idx_receipts_user on public.receipts (user_id);

-- ============================================================================
-- 15) REMINDERS
-- ============================================================================
create table if not exists public.reminders (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  due_date    date,
  amount      numeric(14,2),
  category_id uuid references public.categories(id) on delete set null,
  repeat      text,
  done        boolean not null default false,
  notify_me   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_reminders_user on public.reminders (user_id, done, due_date);

-- ============================================================================
-- 16) NOTIFICATIONS (in-app: budget exceeded, bill due, khata overdue)
-- ============================================================================
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('budget','bill','khata','recurring','system')),
  title      text not null,
  body       text,
  link       text,
  ref_id     uuid,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications (user_id, read_at, created_at desc);
-- One notification per source per day (stops duplicate budget/bill nags).
-- `created_at::date` alone is only STABLE (it depends on the session TimeZone),
-- and Postgres refuses non-IMMUTABLE expressions in an index. Pinning the cast
-- to UTC makes it immutable and gives every user a consistent daily bucket.
create unique index if not exists notifications_dedupe
  on public.notifications (
    user_id, kind, ref_id, (((created_at at time zone 'UTC'))::date)
  )
  where ref_id is not null;

-- ============================================================================
-- 17) TRANSACTION TAGS (many-to-many)
-- ============================================================================
create table if not exists public.transaction_tags (
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);
create index if not exists idx_tt_user on public.transaction_tags (user_id);
create index if not exists idx_tt_tag on public.transaction_tags (tag_id);

-- ============================================================================
-- 18) DASHBOARD PREFS
-- ============================================================================
create table if not exists public.dashboard_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  visible    jsonb not null default '["balance","income","expense","today","week","month","savings"]',
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 19) ACCOUNT BALANCES (trigger-maintained running balance)
-- ============================================================================
create table if not exists public.account_balances (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  balance    numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists idx_ab_user on public.account_balances (user_id);

-- ============================================================================
-- PRIVILEGES
--
-- RLS decides WHICH ROWS a role may touch; it does not grant access to the
-- table at all. Without these grants PostgREST returns
--   42501 "permission denied for table categories"
-- even though the policies are correct. Granting table-level access to
-- `authenticated` is safe precisely because RLS still restricts every row to
-- its owner — this mirrors Supabase's own default setup.
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant usage, select on all sequences in schema public
  to authenticated, service_role;
grant execute on all functions in schema public
  to authenticated, service_role;

-- Signed-out visitors need no data access at all: every policy below requires
-- an authenticated uid, so `anon` is deliberately given nothing.

-- Anything created later inherits the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;

-- ============================================================================
-- ROW LEVEL SECURITY — owner-only on every user-owned table
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','categories','subcategories','accounts','payment_methods',
    'vendors','tags','transactions','common_choices','budgets','recurring_rules',
    'shopping_lists','shopping_items','khata_people','khata_entries',
    'khata_payments','receipts','reminders','notifications','transaction_tags',
    'dashboard_prefs','account_balances'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- NB: deliberately NOT `force row level security`. FORCE also applies RLS
    -- to the table owner, which is the role the SECURITY DEFINER triggers below
    -- run as — an easy source of obscure failures for no real gain, since the
    -- app only ever connects as `authenticated`.
    execute format('drop policy if exists "owner_all_%s" on public.%I', t, t);
    execute format('create policy "owner_all_%s" on public.%I
                    for all to authenticated
                    using (user_id = (select auth.uid()))
                    with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- ============================================================================
-- STORAGE
--
-- Receipt files are stored in Cloudinary (private, `type: authenticated`), not
-- in Supabase Storage, so no bucket or storage policies are created here.
-- If you previously ran an older version of this file, the unused `receipts`
-- bucket can be deleted from the Supabase dashboard.
-- ============================================================================

-- ============================================================================
-- TRIGGER: keep account_balances in sync on every transaction write.
--   balance = opening_balance + income - expense + transfers_in - transfers_out
-- ============================================================================
create or replace function public.recalc_account_balance(p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_bal  numeric;
begin
  if p_account_id is null then return; end if;
  select user_id into v_user from public.accounts where id = p_account_id;
  if v_user is null then
    delete from public.account_balances where account_id = p_account_id;
    return;
  end if;

  select a.opening_balance
    + coalesce((select sum(amount) from public.transactions
                 where account_id = p_account_id and type = 'income'), 0)
    - coalesce((select sum(amount) from public.transactions
                 where account_id = p_account_id and type = 'expense'), 0)
    + coalesce((select sum(amount) from public.transactions
                 where transfer_to_account_id = p_account_id and type = 'transfer'), 0)
    - coalesce((select sum(amount) from public.transactions
                 where account_id = p_account_id and type = 'transfer'), 0)
    into v_bal
  from public.accounts a where a.id = p_account_id;

  insert into public.account_balances (account_id, user_id, balance, updated_at)
  values (p_account_id, v_user, coalesce(v_bal, 0), now())
  on conflict (account_id)
  do update set balance = excluded.balance, updated_at = now();
end $$;

create or replace function public.recalc_balances_for_tx()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    perform public.recalc_account_balance(new.account_id);
    perform public.recalc_account_balance(new.transfer_to_account_id);
  end if;
  -- `is distinct from` is null-safe; the previous coalesce(uuid,'') form raised
  -- "invalid input syntax for type uuid" on every UPDATE.
  if tg_op = 'UPDATE' then
    if old.account_id is distinct from new.account_id then
      perform public.recalc_account_balance(old.account_id);
    end if;
    if old.transfer_to_account_id is distinct from new.transfer_to_account_id then
      perform public.recalc_account_balance(old.transfer_to_account_id);
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.recalc_account_balance(old.account_id);
    perform public.recalc_account_balance(old.transfer_to_account_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_recalc_balances on public.transactions;
create trigger trg_recalc_balances
after insert or update or delete on public.transactions
for each row execute function public.recalc_balances_for_tx();

-- Opening-balance edits must also refresh the running balance.
create or replace function public.recalc_on_account_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_account_balance(new.id);
  return null;
end $$;

drop trigger if exists trg_account_balance_seed on public.accounts;
create trigger trg_account_balance_seed
after insert or update of opening_balance on public.accounts
for each row execute function public.recalc_on_account_change();

-- ============================================================================
-- TRIGGER: remember frequent category/payment pairs for quick-add ordering.
-- ============================================================================
create or replace function public.touch_common_choice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and new.type <> 'transfer' then
    insert into public.common_choices
      (user_id, category_id, payment_method_id, account_id, usage_count, last_used_at)
    values (new.user_id, new.category_id, new.payment_method_id, new.account_id, 1, now())
    on conflict (user_id, category_id, payment_method_id)
    do update set usage_count  = public.common_choices.usage_count + 1,
                  last_used_at = now(),
                  account_id   = excluded.account_id,
                  updated_at   = now();
  end if;
  return new;
end $$;

drop trigger if exists trg_touch_common_choice on public.transactions;
create trigger trg_touch_common_choice
after insert on public.transactions
for each row execute function public.touch_common_choice();

-- ============================================================================
-- TRIGGER: khata entry status follows its payments automatically.
-- ============================================================================
create or replace function public.sync_khata_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid := coalesce(new.khata_entry_id, old.khata_entry_id);
  v_total numeric;
  v_paid  numeric;
begin
  select amount into v_total from public.khata_entries where id = v_entry;
  if v_total is null then return null; end if;
  select coalesce(sum(amount), 0) into v_paid
    from public.khata_payments where khata_entry_id = v_entry;

  update public.khata_entries
     set status = case
                    when v_paid <= 0 then 'open'
                    when v_paid >= v_total then 'settled'
                    else 'partially_paid'
                  end
   where id = v_entry;
  return null;
end $$;

drop trigger if exists trg_khata_status on public.khata_payments;
create trigger trg_khata_status
after insert or update or delete on public.khata_payments
for each row execute function public.sync_khata_status();

-- ============================================================================
-- updated_at helpers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_settings_updated on public.user_settings;
create trigger trg_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_dp_updated on public.dashboard_prefs;
create trigger trg_dp_updated before update on public.dashboard_prefs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tx_updated on public.transactions;
create trigger trg_tx_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RPC: post due recurring rules as real transactions.
-- SECURITY INVOKER so RLS still applies: a user can only post their own rules.
-- ============================================================================
create or replace function public.post_due_recurring()
returns int language plpgsql security invoker set search_path = public as $$
declare
  r      public.recurring_rules%rowtype;
  n      int := 0;
  v_next date;
begin
  for r in
    select * from public.recurring_rules
     where user_id = auth.uid() and is_active and auto_post
       and next_run is not null and next_run <= current_date
  loop
    -- Cap the catch-up loop so a long-dormant rule cannot run away.
    while r.next_run is not null and r.next_run <= current_date and n < 400 loop
      insert into public.transactions
        (user_id, type, amount, category_id, account_id, payment_method_id,
         vendor_id, note, transaction_date, is_recurring, is_recurring_rule_id)
      values
        (r.user_id, r.type, r.amount, r.category_id, r.account_id, r.payment_method_id,
         r.vendor_id, coalesce(r.note, r.title), r.next_run::timestamptz, true, r.id);
      n := n + 1;

      v_next := case r.frequency
        when 'daily'   then r.next_run + (r.interval_step || ' days')::interval
        when 'weekly'  then r.next_run + (r.interval_step * 7 || ' days')::interval
        when 'monthly' then r.next_run + (r.interval_step || ' months')::interval
        when 'yearly'  then r.next_run + (r.interval_step || ' years')::interval
        else                r.next_run + (r.interval_step || ' days')::interval
      end;
      r.next_run := v_next;
    end loop;

    update public.recurring_rules
       set next_run = r.next_run, last_generated_at = now()
     where id = r.id;
  end loop;
  return n;
end $$;

grant execute on function public.post_due_recurring() to authenticated;
