# Khata — Personal Expense & Household Manager

A fast, private personal khata: record an expense in about three seconds, track
household budgets, manage bills and shopping, and keep a lending/borrowing
ledger — all backed by real data, never placeholder numbers.

Built with **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
**Tailwind v4** · **Supabase** (Postgres, Auth, Storage, Row Level Security) ·
**Recharts**.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

From <https://supabase.com/dashboard>, then note the values under
**Project Settings → API**.

### 3. Configure the environment

Copy `.env.example` to `.env.local` and fill it in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key

# Server-only. Never prefix with NEXT_PUBLIC_.
# Base URL for the links Supabase emails out (verify, password reset).
# On Vercel this is optional: VERCEL_PROJECT_PRODUCTION_URL is injected for you.
SITE_URL=http://localhost:3000

# Optional: used for seeding at sign-up and for permanent account deletion.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: receipt scanning. Free key from https://ocr.space
OCR_API_KEY=
```

### 4. Apply the database schema — **required**

Open the **SQL Editor** in Supabase, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it.

It is idempotent, so it is safe to re-run after pulling changes. It creates
every table, index, policy and trigger. (Receipt images live in Cloudinary,
not in Supabase Storage, so no bucket is created.)

> **Do not skip this.** Without it you will see
> `Could not find the table 'public.subcategories'` or
> `permission denied for table categories`.

### 5. Configure email delivery — **required**

Sign-up and password reset are unavailable until this is set, because the app
sends those emails itself. It asks Supabase to *generate* the confirmation link
and then delivers it through your own mailbox, so Supabase's built-in mailer —
throttled to a few messages an hour and not meant for production — is never
used, and its SMTP settings can be left alone.

```bash
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=sixteencharacters
MAIL_FROM_NAME=Khata
```

`GMAIL_APP_PASSWORD` is a Google **App Password**, not your account password.
Create one at <https://myaccount.google.com/apppasswords>; it requires 2-Step
Verification to be on. Google prints it as four blocks of four for readability
and the spaces are cosmetic — they are stripped, so either form works.

Gmail rewrites the `From` header to `GMAIL_USER` whatever the app sends, so
`MAIL_FROM_NAME` controls only the display name. A free account allows roughly
500 recipients a day.

Still set the auth URLs, under **Authentication → URL Configuration** in
Supabase — they decide what the link inside the email points at:

- **Site URL** — your deployed origin, e.g. `https://your-app.vercel.app`
- **Redirect URLs** — add `https://your-app.vercel.app/**` and
  `http://localhost:3000/**`

Supabase refuses a redirect target that is not on that allow-list, which is the
usual reason a deployed app still emails `localhost` links.

### 6. Run

```bash
npm run dev
```

Open <http://localhost:3000>. Sign up, and onboarding will create your default
categories, payment methods and accounts.

---

## Security model

Financial data is private by definition, so ownership is enforced in three
independent layers. A mistake in any one of them is caught by the others.

| Layer | What it guarantees |
|---|---|
| **Row Level Security** | Every user-owned table has RLS enabled with an owner-only policy (`user_id = auth.uid()`). A user cannot read or write another user's rows even with a direct SQL query. |
| **Table privileges** | Only the `authenticated` role is granted table access. Signed-out visitors (`anon`) are granted nothing. |
| **Server actions** | Every mutation resolves the user id from `auth.getUser()` (which verifies the JWT), never from client input, and re-checks that each referenced category / account / tag belongs to that user. |

Two details worth knowing:

- **RLS is not a substitute for `GRANT`.** RLS decides *which rows* a role may
  touch; it does not grant access to the table at all. Both are in
  `schema.sql`.
- **RLS does not stop cross-user *references*.** It blocks reading someone
  else's category, but the foreign-key check runs with elevated privileges, so
  a crafted request could otherwise attach another user's `category_id` to its
  own transaction. `assertOwned()` in `src/lib/server/guards.ts` closes that.

Receipts live in a **private** storage bucket under `{user_id}/{transaction_id}/`,
with the path built server-side and a matching storage policy. They are served
only through short-lived signed URLs.

---

## Project layout

```
src/
├─ app/
│  ├─ (app)/              Authenticated pages (dashboard, transactions, …)
│  ├─ actions/            Server actions — ALL mutations live here
│  ├─ api/ocr/            Receipt OCR endpoint
│  ├─ login, signup, …    Auth pages
│  └─ onboarding/         First-run setup (seeds the account)
├─ components/            UI kit, charts, transaction and layout components
├─ context/               Toast + app-data providers
├─ lib/
│  ├─ analytics.ts        Pure aggregation (totals, budgets, calendar, insights)
│  ├─ export.ts           CSV / Excel / PDF export
│  ├─ parser.ts           Smart free-text entry parser
│  ├─ validation.ts       Shared zod schemas (server + client)
│  ├─ server/             Session, ownership guards, data reads, notifications
│  └─ supabase/           Browser, server and service-role clients
├─ types/                 Row shapes mirroring the schema
└─ middleware.ts          Session refresh + route protection
supabase/schema.sql       The whole database
```

**Where to add things**

- A new mutation → a server action in `src/app/actions/`, wrapped in `run()`,
  guarded with `requireUser()` + `assertOwned()`.
- A new calculation → a pure function in `src/lib/analytics.ts` (easy to reason
  about and to test).
- A new read → `src/lib/server/data.ts`.

---

## How the money maths works

Two rules hold everywhere:

1. **Transfers are never income or expense.** Moving money between your own
   accounts changes no totals; transfers are filtered out of every sum.
2. **Everything is dated by `transaction_date`** (the effective date you can
   edit), not `created_at` (when it was typed in).

Account balances are maintained by a Postgres trigger:

```
balance = opening_balance + income − expenses + transfers_in − transfers_out
```

Because the trigger owns that number, adding, editing or deleting a transaction
updates the dashboard, balances, budgets, reports and savings together — there
is no separate figure that can drift.

---

## Features

- **Two-tap entry** — `＋ → Amount → Category → Save`. Date, time, currency and
  account are filled in automatically; everything else is optional.
- **Smart text entry** — type `groceries 3500 cash at Imtiaz`, and the amount,
  category, payment method, vendor and date are detected. Always shown for
  confirmation first.
- **Voice entry** — the same flow, dictated (Web Speech API).
- **Receipt scanning** — photograph a receipt to detect the shop, date and
  total. Requires confirmation before anything is saved.
- **Undo** — every save and delete can be undone from the toast.
- Transactions with search and filters (date, category, account, payment
  method, vendor, amount range, tags), grouped by day.
- Daily / monthly / yearly khata, and a calendar heat view.
- Budgets with progress, warning thresholds and exceeded alerts.
- Bills & recurring — auto-posted on their due date.
- Shopping list with one-tap **convert purchased item → expense**.
- Khata ledger for lending and borrowing, with partial repayments.
- Reports and insights, always pairing charts with the exact figures.
- Export to CSV, Excel and PDF; import from CSV/Excel with column mapping and a
  preview.
- Light / dark / system themes, rendered correctly on first paint.

---

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
npx tsc --noEmit  # typecheck
```

---

## Notes and limitations

- **Import** accepts `.csv`, `.xlsx` and `.xls`, up to 5,000 rows per file.
  `exceljs` is loaded dynamically, so it is only downloaded when you actually
  import a spreadsheet.
- **OCR** needs `OCR_API_KEY`. Without it the endpoint returns a clear
  "not configured" message and entry falls back to manual — it never pretends
  to work.
- **`SUPABASE_SERVICE_ROLE_KEY` is optional.** Onboarding seeds a new account
  under the user's own session. The key is only needed for seeding at sign-up
  and for permanently deleting an account.
- Transactions and reports fetch up to 5,000 rows and filter in the browser for
  instant response. Server-side filtering already exists in
  `src/lib/server/data.ts` if that ever becomes the bottleneck.
- Notifications are generated when the app shell renders, de-duplicated to one
  per source per day. There is no background job.

See [`BUILD_PLAN.md`](BUILD_PLAN.md) for build phases and current status.
