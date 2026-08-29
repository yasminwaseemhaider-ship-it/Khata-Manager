# Khata — Build Plan & Progress

Personal Khata + Expense Tracker + Household Manager + Budget & Analytics.
Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Cloudinary (receipts) · Recharts.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not started

---

## Phase 1 — Database & security foundation ✅

- [x] Full schema rewrite (`supabase/schema.sql`), idempotent and re-runnable
- [x] All 22 tables incl. the ones the spec named: `subcategories`, `khata_people`,
      `shopping_lists`, `notifications`, `receipts`, `transaction_tags`
- [x] New columns: `transactions.qty / unit_price / subcategory_id / updated_at`,
      `shopping_items.priority`, `khata_entries.due_date / entry_date`,
      `accounts.is_default`, `budgets.alert_at_pct`
- [x] RLS **enabled** on every user-owned table, owner-only policies
- [x] **Bug fixed:** balance trigger used `coalesce(uuid,'')`, which threw
      `invalid input syntax for type uuid` on every transaction UPDATE →
      now null-safe `is distinct from`
- [x] Balance trigger also fires on opening-balance edits
- [x] Khata status (open / partly paid / settled) derived by trigger
- [x] `post_due_recurring()` RPC (SECURITY INVOKER, so RLS still applies)
- [x] `common_choices` unique index uses `NULLS NOT DISTINCT` so quick-add
      frequency counting actually de-duplicates
- [x] **Bug fixed:** RLS was enabled with correct policies but no `GRANT`s, so
      PostgREST returned `42501 permission denied for table categories`. RLS
      decides *which rows* a role may touch; it does not grant table access at
      all. Table privileges are now granted to `authenticated` (never `anon`).
- [x] **Bug fixed:** the notifications dedupe index used `created_at::date`,
      which is only STABLE — Postgres rejects non-IMMUTABLE index expressions.
      Pinned to `(created_at at time zone 'UTC')::date`.
- [x] Dropped `force row level security`: it also applies RLS to the table
      owner, which is the role the SECURITY DEFINER triggers run as.
- [x] **Schema applied** to the live project and verified end-to-end.

> Verified against the real database with a temporary user: sign-in →
> onboarding writes → transaction insert → transaction UPDATE (the old trigger
> crash) → balance recomputed correctly (5000 − 2000 = 3000) → confirmed the
> user could see only its own rows → test user deleted. All checks passed.

## Phase 2 — Server-side ownership enforcement ✅

- [x] `requireUser()` — verifies the JWT via `auth.getUser()` (not the
      spoofable `getSession()`); every mutation takes its user id from here
- [x] `assertOwned()` — verifies **every client-supplied foreign key** belongs
      to the acting user (RLS blocks reading others' rows but not *referencing*
      them)
- [x] `run()` wrapper → typed `ActionResult`, friendly errors, no internals leaked
- [x] Shared zod schemas (`src/lib/validation.ts`) used by server + client
- [x] Server actions: transactions, taxonomy, accounts, budgets, khata,
      shopping, recurring, reminders, receipts, settings
- [x] **Bug fixed:** `format.ts` kept the currency symbol in module-level
      mutable state — shared across requests on the server, so one user's
      currency could render in another's page. Now pure functions.
- [x] Service-role client returns `null` when unconfigured instead of crashing

## Phase 3 — Design system & app shell ✅

- [x] Token-based CSS (`globals.css`): light / dark / system, no flash on load
      (theme cookie read server-side in the root layout)
- [x] UI kit rebuilt on tokens: Button, Modal (focus trap + Escape + restore),
      ConfirmDialog (type-to-confirm), Field, Card, StatCard, Meter, Badge,
      EmptyState, Skeleton
- [x] Toasts with **Undo** actions
- [x] App shell: grouped sidebar, mobile drawer, bottom nav, `N` shortcut,
      theme switcher, notification bell
- [x] `AppDataProvider` — categories/accounts/tags/settings fetched once per
      navigation, shared with all client components
- [x] Accessibility: skip link, focus-visible rings, ARIA roles, reduced-motion

## Phase 4 — Ultra-fast expense entry ✅

- [x] `＋ → Amount → Category → Save` — only those two fields required
- [x] Autofocused amount, on-screen keypad for one-handed mobile use
- [x] Auto-detected: date, time, user, currency, default/last-used account
- [x] Frequently-used categories float to the front (driven by `common_choices`)
- [x] Everything else behind "More details": date/time, subcategory, description,
      vendor, account, payment method, qty, unit price, receipt, tags
- [x] Save & add another · Undo after saving
- [x] Edit · Delete · Duplicate · Repeat-today (row menu)
- [x] Smart text entry with a **confirmation step** — nothing saves from a guess
- [x] Voice entry (Web Speech API) feeding the same confirmation
- [x] **Bugs fixed in the parser:** `matchKnown()` always returned `undefined`
      (every keyword fallback was dead code); `&&`/`||` precedence let a later
      keyword overwrite an already-detected category

## Phase 5 — Core money pages ✅

- [x] **Dashboard** — total income, total expenses, current balance, today,
      this week, this month, savings + rate, recent transactions, category
      donut, income-vs-expense, daily chart, budgets, khata, upcoming bills,
      quick actions. All from real rows, nothing hard-coded.
- [x] **Transactions** — All / Expenses / Income / Transfers, search, and
      filters for date range, category, account, payment method, vendor,
      amount range and tags; grouped by day with per-day totals; multi-select
      bulk delete; CSV export of the filtered view
- [x] **Daily / Monthly / Yearly** — prev/next navigation, income, expenses,
      balance, savings, category breakdown, charts, day-by-day and
      month-by-month tables
- [x] **Calendar** — month grid, per-date spend with heat shading, tap a date
      for that day's transactions
- [x] **Accounts** — cash/bank/card/wallet/savings, opening + current balance,
      per-account in/out, default account, archive vs. delete guard, transfers
      (excluded from income & expense everywhere)
- [x] **Budgets** — per-category limits, monthly/weekly/yearly, spent /
      remaining / progress, configurable warning threshold, exceeded state
- [x] **Khata** — lend & borrow, people, partial payments, remaining amount,
      pending / partly-paid / settled / overdue, due dates, notes
- [x] **Shopping list** — item, qty, unit, category, priority, purchased state,
      estimated cost, and one-tap **convert purchased item → expense**
      (guarded against double-counting)
- [x] **Bills & recurring** — daily/weekly/monthly/yearly/custom, auto-post on
      due date, "log now", pause/resume, approximate monthly cost

## Phase 6 — Remaining pages ✅

- [x] **Income** — monthly navigation, income sources, 6-month trend, recurring
      income, entries grouped by day
- [x] **Reports** — today / week / month / year / custom range / all time; by
      category, vendor, account and payment method; income vs expense; savings;
      averages; highest category and day; trend vs the previous period —
      charts **plus** the exact numbers beside them
- [x] **Insights** — plain-language observations computed from the real data
      (month-on-month change, savings rate, unusual months, top category,
      budget state, small-spend creep, weekday pattern, overdue khata)
- [x] **Reminders** — due / overdue badges, amounts, mark done, repeat
- [x] **Settings** — profile & currency, categories + subcategories, payment
      methods, vendors, tags, appearance & alerts, security, export/data
- [x] `/vendors` and `/tags` redirect into the matching Settings tab

## Phase 7 — Export / Import ✅

- [x] Export library: CSV (papaparse, BOM for Excel), Excel (.xls), PDF (print)
- [x] CSV export of the filtered view on Transactions
- [x] Export by date range / month / year / category / all data
      (Reports page + Settings → Data), in CSV, Excel and PDF
- [x] Validated CSV/Excel **import** with preview and field mapping
      (4-step wizard: file → auto-matched column mapping → preview with a
      per-row validity check → result summary). Real `.xlsx` support via
      `exceljs`, dynamically imported so it isn't in the main bundle.
      Optional "create missing categories/accounts/vendors" and duplicate
      skipping, so re-importing the same file is safe.

## Phase 8 — Receipts & OCR ✅

- [x] **Migrated to Cloudinary** at your request, uploaded as
      `type: authenticated` so receipts are NOT publicly reachable — delivery
      is via short-lived signed URLs minted on the server. Folder path
      (`khata/{user_id}/{transaction_id}`) is built server-side.
- [x] Upload / view / delete, attached from quick-add and edit
- [x] Supabase Storage bucket + policies removed from the schema
- [x] OCR route (`/api/ocr`) — extracts shop, date, total and line items via
      OCR.space; auth-gated, size/type checked, 25s timeout. The response is a
      **suggestion only**: the route never writes to the database, and the UI
      requires confirmation before filling the form.

## Phase 9 — Auth polish & final pass 🚧

- [x] Sign up / login / logout / forgot / reset
- [x] **Bug fixed:** middleware bounced logged-in users off `/reset-password`,
      but Supabase signs the user in via the recovery link — the reset form was
      unreachable. Also migrated to the Next 16 `proxy` convention.
- [x] Open-redirect guard on `?redirect=` after login
- [x] Password reset / change wired to a real server action
- [x] **Bug fixed:** onboarding ↔ dashboard redirect loop. The app layout sends
      users with no categories to `/onboarding`, but onboarding created
      nothing, so it bounced straight back. Onboarding now actually seeds the
      account (categories, subcategories, payment methods, Cash + Bank accounts,
      currency, opening balances) **under the user's own session**, so it no
      longer depends on the service-role key being configured.
- [x] Bootstrap removed (was loaded alongside Tailwind, unused)
- [x] `npx tsc --noEmit` clean · `npx next build` green (25 routes)
- [x] Notification generation — budgets at/over their threshold, bills due or
      overdue, khata past its due date. Runs on app-shell render, respects the
      user's alert preferences, de-duplicated to one per source per day.
- [x] README with setup, security model, architecture and known limitations
- [x] `npx tsc --noEmit` clean · `npx eslint` **0 errors** · `next build` green
- [x] Removed dead code (`lib/queries.ts`, `types/database.ts`) and the unused
      Bootstrap dependency; pinned `uuid` via overrides so `exceljs` brings no
      known vulnerability (`npm audit`: 0)
- [x] Fixed React correctness errors surfaced by the compiler: two
      prop-into-state effects (quick-add and edit) replaced with fresh mounts,
      an impure `Date.now()` in render, and a stale `useMemo` dependency
- [ ] **Manual pass through every screen with real data — yours to do**

---

## Known issues still open

| # | Issue | Status |
|---|-------|--------|
| 1 | OCR needs `OCR_API_KEY`; without it the endpoint returns a clear "not configured" message rather than failing oddly | by design |
| 2 | Cloudinary needs `CLOUDINARY_*` keys; uploads show a clear message until they are set | awaiting your keys |
| 3 | Import is capped at 5,000 rows per file | by design |
| 4 | Transactions/reports filter in the browser over a 5,000-row fetch; server-side filtering exists in `data.ts` if that ever gets slow | acceptable for now |

### Error reporting

`run()` used to collapse every non-auth error into "Something went wrong",
including the deliberate ones — which is why a missing `GRANT` surfaced as a
useless generic message. Deliberate, user-facing failures now throw
`ActionError` and are shown as-is; genuine crashes are still reported
generically in production, but show the real message in development.

---

## Setup

1. Run `supabase/schema.sql` in the Supabase SQL editor. **Required** — it
   creates the new tables (`subcategories`, `khata_people`, `shopping_lists`,
   `notifications`) and fixes the balance trigger.
2. Set `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SITE_URL` (server-only), and optionally
   `SUPABASE_SERVICE_ROLE_KEY` (only needed for sign-up seeding and account
   deletion — onboarding seeds without it).
3. `npm run dev`
