import "server-only";

import { cache } from "react";
import { requireUser } from "./session";
import type {
  Account,
  AppNotification,
  Budget,
  Category,
  KhataEntry,
  KhataEntryView,
  KhataPayment,
  KhataPerson,
  PaymentMethod,
  RecurringRule,
  Reminder,
  ShoppingItem,
  ShoppingList,
  Subcategory,
  Tag,
  Taxonomy,
  Transaction,
  TransactionWithTags,
  UserSettings,
  Vendor,
} from "@/types";

/**
 * Server-side reads. Every query is scoped by the verified session's user id
 * *and* protected by RLS, so a bug in one layer cannot leak another user's row.
 *
 * `cache()` means several components on the same page share one round trip.
 */

const DEFAULT_SETTINGS = (userId: string): UserSettings => ({
  user_id: userId,
  display_name: null,
  currency_code: "PKR",
  currency_symbol: "Rs.",
  theme: "system",
  week_starts_on: 1,
  default_account_id: null,
  notify_bills: true,
  notify_budgets: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/** Categories, accounts, tags, settings and balances in a single round trip. */
export const getTaxonomy = cache(async function getTaxonomy(): Promise<Taxonomy> {
  const { supabase, userId } = await requireUser();

  const [
    { data: categories },
    { data: subcategories },
    { data: accounts },
    { data: paymentMethods },
    { data: vendors },
    { data: tags },
    { data: settings },
    { data: balances },
    { data: common },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select()
      .eq("user_id", userId)
      .order("sort_order")
      .order("name"),
    supabase.from("subcategories").select().eq("user_id", userId).order("name"),
    supabase
      .from("accounts")
      .select()
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at"),
    supabase.from("payment_methods").select().eq("user_id", userId).order("created_at"),
    supabase.from("vendors").select().eq("user_id", userId).order("name"),
    supabase.from("tags").select().eq("user_id", userId).order("name"),
    supabase.from("user_settings").select().eq("user_id", userId).maybeSingle(),
    supabase.from("account_balances").select("account_id, balance").eq("user_id", userId),
    supabase
      .from("common_choices")
      .select("category_id, usage_count")
      .eq("user_id", userId)
      .order("usage_count", { ascending: false })
      .limit(8),
  ]);

  const balanceMap: Record<string, number> = {};
  for (const b of (balances ?? []) as { account_id: string; balance: number }[]) {
    balanceMap[b.account_id] = Number(b.balance);
  }
  // Accounts with no transactions yet have no balance row; fall back to opening.
  for (const a of (accounts ?? []) as Account[]) {
    if (balanceMap[a.id] === undefined) balanceMap[a.id] = Number(a.opening_balance);
  }

  return {
    categories: (categories ?? []) as Category[],
    subcategories: (subcategories ?? []) as Subcategory[],
    accounts: (accounts ?? []) as Account[],
    paymentMethods: (paymentMethods ?? []) as PaymentMethod[],
    vendors: (vendors ?? []) as Vendor[],
    tags: (tags ?? []) as Tag[],
    settings: ((settings as UserSettings | null) ?? DEFAULT_SETTINGS(userId)),
    balances: balanceMap,
    frequentCategoryIds: ((common ?? []) as { category_id: string | null }[])
      .map((c) => c.category_id)
      .filter((id): id is string => !!id),
  };
});

export interface TransactionQuery {
  from?: Date | string;
  to?: Date | string;
  types?: ("expense" | "income" | "transfer")[];
  categoryIds?: string[];
  accountIds?: string[];
  paymentMethodIds?: string[];
  vendorIds?: string[];
  tagIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  limit?: number;
}

/**
 * Filtered transactions with their tag ids attached.
 * Filtering happens in Postgres (not in the browser), so a user with years of
 * history still gets a fast, small payload.
 */
export async function getTransactions(
  q: TransactionQuery = {}
): Promise<TransactionWithTags[]> {
  const { supabase, userId } = await requireUser();

  let query = supabase
    .from("transactions")
    .select()
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .limit(q.limit ?? 2000);

  if (q.from) query = query.gte("transaction_date", new Date(q.from).toISOString());
  if (q.to) query = query.lte("transaction_date", new Date(q.to).toISOString());
  if (q.types?.length) query = query.in("type", q.types);
  if (q.categoryIds?.length) query = query.in("category_id", q.categoryIds);
  if (q.accountIds?.length) query = query.in("account_id", q.accountIds);
  if (q.paymentMethodIds?.length) query = query.in("payment_method_id", q.paymentMethodIds);
  if (q.vendorIds?.length) query = query.in("vendor_id", q.vendorIds);
  if (q.minAmount !== undefined) query = query.gte("amount", q.minAmount);
  if (q.maxAmount !== undefined) query = query.lte("amount", q.maxAmount);
  if (q.search) {
    const safe = q.search.replace(/[%,()]/g, " ").trim();
    if (safe) query = query.ilike("note", `%${safe}%`);
  }

  // Tag filtering needs the join table first.
  if (q.tagIds?.length) {
    const { data: tagged } = await supabase
      .from("transaction_tags")
      .select("transaction_id")
      .eq("user_id", userId)
      .in("tag_id", q.tagIds);
    const ids = [...new Set((tagged ?? []).map((t: { transaction_id: string }) => t.transaction_id))];
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data } = await query;
  const rows = (data ?? []) as Transaction[];
  if (rows.length === 0) return [];

  const { data: links } = await supabase
    .from("transaction_tags")
    .select("transaction_id, tag_id")
    .eq("user_id", userId)
    .in("transaction_id", rows.map((r) => r.id));

  const tagMap = new Map<string, string[]>();
  for (const l of (links ?? []) as { transaction_id: string; tag_id: string }[]) {
    const list = tagMap.get(l.transaction_id) ?? [];
    list.push(l.tag_id);
    tagMap.set(l.transaction_id, list);
  }

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    tag_ids: tagMap.get(r.id) ?? [],
  }));
}

/** Everything needed for dashboards/reports: one wide fetch, cached per request. */
export const getAllTransactions = cache(async function getAllTransactions(): Promise<
  TransactionWithTags[]
> {
  return getTransactions({ limit: 5000 });
});

export const getBudgets = cache(async function getBudgets(): Promise<Budget[]> {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("budgets")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Budget[]).map((b) => ({ ...b, amount: Number(b.amount) }));
});

export const getRecurringRules = cache(async function getRecurringRules(): Promise<
  RecurringRule[]
> {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("recurring_rules")
    .select()
    .eq("user_id", userId)
    .order("next_run", { ascending: true, nullsFirst: false });
  return ((data ?? []) as RecurringRule[]).map((r) => ({ ...r, amount: Number(r.amount) }));
});

export const getReminders = cache(async function getReminders(): Promise<Reminder[]> {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("reminders")
    .select()
    .eq("user_id", userId)
    .order("done")
    .order("due_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as Reminder[];
});

export const getShopping = cache(async function getShopping(): Promise<{
  lists: ShoppingList[];
  items: ShoppingItem[];
}> {
  const { supabase, userId } = await requireUser();
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase
      .from("shopping_lists")
      .select()
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at"),
    supabase
      .from("shopping_items")
      .select()
      .eq("user_id", userId)
      .order("purchased")
      .order("created_at", { ascending: false }),
  ]);
  return {
    lists: (lists ?? []) as ShoppingList[],
    items: (items ?? []) as ShoppingItem[],
  };
});

/** Khata entries enriched with paid/remaining/overdue — computed server-side. */
export const getKhata = cache(async function getKhata(): Promise<{
  people: KhataPerson[];
  entries: KhataEntryView[];
}> {
  const { supabase, userId } = await requireUser();
  const [{ data: people }, { data: entries }, { data: payments }] = await Promise.all([
    supabase.from("khata_people").select().eq("user_id", userId).order("name"),
    supabase
      .from("khata_entries")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("khata_payments")
      .select()
      .eq("user_id", userId)
      .order("paid_at", { ascending: false }),
  ]);

  const byEntry = new Map<string, KhataPayment[]>();
  for (const p of (payments ?? []) as KhataPayment[]) {
    const list = byEntry.get(p.khata_entry_id) ?? [];
    list.push({ ...p, amount: Number(p.amount) });
    byEntry.set(p.khata_entry_id, list);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const views: KhataEntryView[] = ((entries ?? []) as KhataEntry[]).map((e) => {
    const pays = byEntry.get(e.id) ?? [];
    const paid = pays.reduce((s, p) => s + p.amount, 0);
    const amount = Number(e.amount);
    const remaining = Math.max(0, amount - paid);
    return {
      ...e,
      amount,
      paid,
      remaining,
      is_overdue:
        remaining > 0 && !!e.due_date && new Date(e.due_date).getTime() < today.getTime(),
      payments: pays,
    };
  });

  return { people: (people ?? []) as KhataPerson[], entries: views };
});

export const getNotifications = cache(async function getNotifications(): Promise<
  AppNotification[]
> {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("notifications")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as AppNotification[];
});
