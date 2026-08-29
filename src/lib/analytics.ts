// ============================================================================
// Pure aggregation helpers over an already-fetched list of the authenticated
// user's transactions.
//
// Two rules hold everywhere in this file:
//   1. TRANSFERS ARE NEVER INCOME OR EXPENSE. Moving money between your own
//      accounts changes no totals; it is filtered out of every sum below.
//   2. Everything is derived from `transaction_date` (the effective date the
//      user can edit), not `created_at` (when it happened to be typed in).
// ============================================================================
import type { Transaction, Category } from "@/types";

export interface Totals {
  income: number;
  expenses: number;
  /** income − expenses over the same window */
  net: number;
}

export interface SeriesPoint {
  label: string;
  value: number;
}

const EMPTY: Totals = { income: 0, expenses: 0, net: 0 };

// ---------------------------------------------------------------------------
// Date keys
// ---------------------------------------------------------------------------
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function monthKeyOf(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function yearKeyOf(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return String(date.getFullYear());
}

export function currentMonthKey(): string {
  return monthKeyOf(new Date());
}

/** Start of the week containing `d`. `weekStartsOn`: 0 = Sunday, 1 = Monday. */
export function startOfWeek(d: Date, weekStartsOn = 1): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

export function endOfWeek(d: Date, weekStartsOn = 1): Date {
  const s = startOfWeek(d, weekStartsOn);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

// ---------------------------------------------------------------------------
// Core totals
// ---------------------------------------------------------------------------
/** Sum income/expense over the transactions matching `pred`. */
export function totalsWhere(
  txns: Transaction[],
  pred: (t: Transaction, d: Date) => boolean
): Totals {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (t.type === "transfer") continue; // rule 1
    const d = new Date(t.transaction_date);
    if (!pred(t, d)) continue;
    if (t.type === "expense") expenses += Number(t.amount);
    else income += Number(t.amount);
  }
  return { income, expenses, net: income - expenses };
}

export function totalsAllTime(txns: Transaction[]): Totals {
  return totalsWhere(txns, () => true);
}

export function totalsForDay(txns: Transaction[], day: string): Totals {
  return totalsWhere(txns, (_t, d) => dayKey(d) === day);
}

export function totalsForMonth(txns: Transaction[], month: string): Totals {
  return totalsWhere(txns, (_t, d) => monthKeyOf(d) === month);
}

export function totalsForYear(txns: Transaction[], year: string): Totals {
  return totalsWhere(txns, (_t, d) => yearKeyOf(d) === year);
}

export function totalsBetween(txns: Transaction[], from: Date, to: Date): Totals {
  const a = from.getTime();
  const b = to.getTime();
  return totalsWhere(txns, (_t, d) => {
    const ms = d.getTime();
    return ms >= a && ms <= b;
  });
}

export function totalsForWeek(txns: Transaction[], ref = new Date(), weekStartsOn = 1): Totals {
  return totalsBetween(txns, startOfWeek(ref, weekStartsOn), endOfWeek(ref, weekStartsOn));
}

/**
 * Savings = income − expenses for the window. Positive means the user kept
 * money; negative means they spent more than they earned.
 */
export function savings(t: Totals): number {
  return t.income - t.expenses;
}

/** Savings rate as a percentage of income (0 when there was no income). */
export function savingsRate(t: Totals): number {
  if (t.income <= 0) return 0;
  return ((t.income - t.expenses) / t.income) * 100;
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------
/** Expense total per day-of-month for `month`, with empty days included. */
export function dailyExpenses(txns: Transaction[], month: string): SeriesPoint[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const map = new Map<number, number>();
  for (let i = 1; i <= days; i++) map.set(i, 0);

  for (const t of txns) {
    if (t.type !== "expense") continue;
    const d = new Date(t.transaction_date);
    if (monthKeyOf(d) !== month) continue;
    map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + Number(t.amount));
  }
  return [...map.entries()].map(([day, value]) => ({ label: String(day), value }));
}

/** Expense total per month for `year`, all 12 months present. */
export function monthlyExpenses(txns: Transaction[], year: string): SeriesPoint[] {
  const map = new Map<number, number>();
  for (let i = 1; i <= 12; i++) map.set(i, 0);
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const d = new Date(t.transaction_date);
    if (yearKeyOf(d) !== year) continue;
    map.set(d.getMonth() + 1, (map.get(d.getMonth() + 1) ?? 0) + Number(t.amount));
  }
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return [...map.entries()].map(([m, value]) => ({ label: names[m - 1], value }));
}

export function incomeVsExpense(
  txns: Transaction[],
  months: string[]
): { month: string; expense: number; income: number; savings: number }[] {
  return months.map((m) => {
    const t = totalsForMonth(txns, m);
    return { month: m, expense: t.expenses, income: t.income, savings: t.net };
  });
}

/** The last `count` month keys, oldest first, ending with the current month. */
export function recentMonthKeys(count = 6, ref = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(monthKeyOf(d));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------
export interface Slice {
  id: string | null;
  name: string;
  color?: string | null;
  total: number;
  count: number;
  pct: number;
}

function toSlices(
  map: Map<string | null, { name: string; color?: string | null; total: number; count: number }>
): Slice[] {
  const grand = [...map.values()].reduce((s, v) => s + v.total, 0);
  return [...map.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      color: v.color,
      total: v.total,
      count: v.count,
      pct: grand > 0 ? (v.total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Group a transaction list by any FK, resolving names from a lookup list. */
export function breakdownBy(
  txns: Transaction[],
  key: "category_id" | "vendor_id" | "account_id" | "payment_method_id" | "subcategory_id",
  lookup: { id: string; name: string; color?: string | null }[],
  type: "expense" | "income" = "expense",
  emptyLabel = "Uncategorized"
): Slice[] {
  const byId = new Map(lookup.map((l) => [l.id, l]));
  const map = new Map<
    string | null,
    { name: string; color?: string | null; total: number; count: number }
  >();

  for (const t of txns) {
    if (t.type !== type) continue;
    const id = (t[key] as string | null) ?? null;
    const meta = id ? byId.get(id) : undefined;
    const name = meta?.name ?? emptyLabel;
    const prev = map.get(id) ?? { name, color: meta?.color, total: 0, count: 0 };
    prev.total += Number(t.amount);
    prev.count += 1;
    map.set(id, prev);
  }
  return toSlices(map);
}

export function expensesByCategory(txns: Transaction[], categories: Category[]): Slice[] {
  return breakdownBy(txns, "category_id", categories, "expense");
}

// ---------------------------------------------------------------------------
// Headline insights
// ---------------------------------------------------------------------------
export interface Insights {
  totalSpent: number;
  totalIncome: number;
  net: number;
  savingsRate: number;
  txCount: number;
  avgPerTransaction: number;
  avgPerActiveDay: number;
  avgPerDay: number;
  topCategory: Slice | null;
  topVendor: Slice | null;
  highestDay: { day: string; total: number } | null;
  largestExpense: Transaction | null;
  /** % change in spend vs. the previous window of equal length. */
  trendPct: number | null;
}

export function buildInsights(
  txns: Transaction[],
  opts: {
    from: Date;
    to: Date;
    categories: { id: string; name: string; color?: string | null }[];
    vendors: { id: string; name: string }[];
    previous?: Transaction[];
  }
): Insights {
  const inWindow = txns.filter((t) => {
    const ms = new Date(t.transaction_date).getTime();
    return ms >= opts.from.getTime() && ms <= opts.to.getTime();
  });

  const totals = totalsAllTime(inWindow);
  const expenses = inWindow.filter((t) => t.type === "expense");

  const perDay = new Map<string, number>();
  for (const t of expenses) {
    const k = dayKey(t.transaction_date);
    perDay.set(k, (perDay.get(k) ?? 0) + Number(t.amount));
  }
  let highestDay: { day: string; total: number } | null = null;
  for (const [day, total] of perDay) {
    if (!highestDay || total > highestDay.total) highestDay = { day, total };
  }

  const spanDays = Math.max(
    1,
    Math.round((opts.to.getTime() - opts.from.getTime()) / 86_400_000) + 1
  );

  const largestExpense =
    expenses.length > 0
      ? expenses.reduce((a, b) => (Number(a.amount) >= Number(b.amount) ? a : b))
      : null;

  let trendPct: number | null = null;
  if (opts.previous) {
    const prev = totalsAllTime(opts.previous).expenses;
    if (prev > 0) trendPct = ((totals.expenses - prev) / prev) * 100;
    else if (totals.expenses > 0) trendPct = 100;
  }

  const cats = breakdownBy(inWindow, "category_id", opts.categories, "expense");
  const vends = breakdownBy(inWindow, "vendor_id", opts.vendors, "expense", "No vendor");

  return {
    totalSpent: totals.expenses,
    totalIncome: totals.income,
    net: totals.net,
    savingsRate: savingsRate(totals),
    txCount: inWindow.length,
    avgPerTransaction: expenses.length ? totals.expenses / expenses.length : 0,
    avgPerActiveDay: perDay.size ? totals.expenses / perDay.size : 0,
    avgPerDay: totals.expenses / spanDays,
    topCategory: cats[0] ?? null,
    topVendor: vends[0] ?? null,
    highestDay,
    largestExpense,
    trendPct,
  };
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export interface BudgetProgress {
  budgetId: string;
  name: string;
  categoryName: string;
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  state: "ok" | "warning" | "exceeded";
  periodLabel: string;
}

/** Window covered by a budget's period, relative to `ref`. */
export function budgetWindow(
  period: "monthly" | "weekly" | "yearly",
  ref = new Date(),
  weekStartsOn = 1
): { from: Date; to: Date; label: string } {
  if (period === "weekly") {
    const from = startOfWeek(ref, weekStartsOn);
    const to = endOfWeek(ref, weekStartsOn);
    return { from, to, label: "This week" };
  }
  if (period === "yearly") {
    return {
      from: new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0),
      to: new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999),
      label: String(ref.getFullYear()),
    };
  }
  return {
    from: new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0),
    to: new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999),
    label: ref.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

export function budgetProgress(
  budget: {
    id: string;
    name: string;
    amount: number;
    period: "monthly" | "weekly" | "yearly";
    category_id?: string | null;
    account_id?: string | null;
    alert_at_pct: number;
  },
  txns: Transaction[],
  categories: { id: string; name: string }[],
  ref = new Date(),
  weekStartsOn = 1
): BudgetProgress {
  const { from, to, label } = budgetWindow(budget.period, ref, weekStartsOn);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  let spent = 0;
  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (budget.category_id && t.category_id !== budget.category_id) continue;
    if (budget.account_id && t.account_id !== budget.account_id) continue;
    const ms = new Date(t.transaction_date).getTime();
    if (ms < fromMs || ms > toMs) continue;
    spent += Number(t.amount);
  }

  const amount = Number(budget.amount);
  const pct = amount > 0 ? (spent / amount) * 100 : 0;
  return {
    budgetId: budget.id,
    name: budget.name,
    categoryName:
      categories.find((c) => c.id === budget.category_id)?.name ?? "All categories",
    amount,
    spent,
    remaining: amount - spent,
    pct,
    state: pct >= 100 ? "exceeded" : pct >= budget.alert_at_pct ? "warning" : "ok",
    periodLabel: label,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export interface CalendarCell {
  date: string;
  inMonth: boolean;
  expense: number;
  income: number;
  count: number;
}

/** A 6×7 grid covering `month`, each cell carrying that day's real totals. */
export function calendarGrid(
  txns: Transaction[],
  month: string,
  weekStartsOn = 1
): CalendarCell[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = startOfWeek(first, weekStartsOn);

  const byDay = new Map<string, { expense: number; income: number; count: number }>();
  for (const t of txns) {
    if (t.type === "transfer") continue;
    const k = dayKey(t.transaction_date);
    const cur = byDay.get(k) ?? { expense: 0, income: 0, count: 0 };
    if (t.type === "expense") cur.expense += Number(t.amount);
    else cur.income += Number(t.amount);
    cur.count += 1;
    byDay.set(k, cur);
  }

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const hit = byDay.get(key);
    cells.push({
      date: key,
      inMonth: d.getMonth() === m - 1 && d.getFullYear() === y,
      expense: hit?.expense ?? 0,
      income: hit?.income ?? 0,
      count: hit?.count ?? 0,
    });
  }
  return cells;
}

/**
 * Group transactions into day buckets with per-day totals, newest first.
 * Generic so callers keep whatever richer row type they passed in
 * (e.g. TransactionWithTags) rather than getting a widened Transaction back.
 */
export function groupByDay<T extends Transaction>(
  txns: T[]
): { day: string; expense: number; income: number; items: T[] }[] {
  const map = new Map<string, { expense: number; income: number; items: T[] }>();
  for (const t of txns) {
    const k = dayKey(t.transaction_date);
    const cur = map.get(k) ?? { expense: 0, income: 0, items: [] };
    if (t.type === "expense") cur.expense += Number(t.amount);
    else if (t.type === "income") cur.income += Number(t.amount);
    cur.items.push(t);
    map.set(k, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, v]) => ({
      day,
      expense: v.expense,
      income: v.income,
      items: v.items.sort(
        (a, b) =>
          new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
      ),
    }));
}

export { EMPTY as EMPTY_TOTALS };
