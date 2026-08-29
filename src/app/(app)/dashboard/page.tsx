import Link from "next/link";
import {
  Wallet, TrendingDown, TrendingUp, PiggyBank, CalendarDays, CalendarRange,
  ArrowRight, Target, Receipt, } from "lucide-react";
import { getAllTransactions, getTaxonomy, getBudgets, getRecurringRules, getKhata } from "@/lib/server/data";
import {
  totalsAllTime, totalsForDay, totalsForWeek, totalsForMonth, dailyExpenses,
  expensesByCategory, incomeVsExpense, recentMonthKeys, budgetProgress, savingsRate,
} from "@/lib/analytics";
import { formatMoney, formatPercent } from "@/lib/format";
import { currentMonthKey, formatMonth, todayISO, relativeDue } from "@/lib/date";
import { Card, CardHeader, CardTitle, StatCard, Meter, Badge } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { DailyExpenseBar, CategoryDonut, IncomeVsExpense } from "@/components/charts/DashboardCharts";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { QuickActions } from "@/components/dashboard/QuickActions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [taxonomy, txns, budgets, rules, khata] = await Promise.all([
    getTaxonomy(),
    getAllTransactions(),
    getBudgets(),
    getRecurringRules(),
    getKhata(),
  ]);

  const { settings, categories, accounts, balances } = taxonomy;
  const symbol = settings.currency_symbol;
  const money = (n: number) => formatMoney(n, symbol);
  const weekStart = settings.week_starts_on;

  const month = currentMonthKey();
  const today = todayISO();

  // Every figure below is computed from real transaction rows.
  const allTime = totalsAllTime(txns);
  const todayTotals = totalsForDay(txns, today);
  const weekTotals = totalsForWeek(txns, new Date(), weekStart);
  const monthTotals = totalsForMonth(txns, month);

  const currentBalance = accounts
    .filter((a) => !a.is_archived)
    .reduce((sum, a) => sum + (balances[a.id] ?? Number(a.opening_balance)), 0);

  const daily = dailyExpenses(txns, month);
  const byCategory = expensesByCategory(txns, categories)
    .slice(0, 8)
    .map((s) => ({ name: s.name, value: s.total, color: s.color }));
  const trend = incomeVsExpense(txns, recentMonthKeys(6));

  const budgetRows = budgets
    .filter((b) => b.is_active)
    .map((b) => budgetProgress(b, txns, categories, new Date(), weekStart))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  const upcomingBills = rules
    .filter((r) => r.is_active && r.next_run)
    .slice(0, 4);

  const khataOwedToMe = khata.entries
    .filter((e) => e.direction === "owed" && e.remaining > 0)
    .reduce((s, e) => s + e.remaining, 0);
  const khataIOwe = khata.entries
    .filter((e) => e.direction === "owing" && e.remaining > 0)
    .reduce((s, e) => s + e.remaining, 0);

  const monthSavings = monthTotals.net;
  const rate = savingsRate(monthTotals);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = settings.display_name?.split(" ")[0] ?? "";

  if (txns.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-6 md:px-6">
        <h1 className="text-xl font-bold text-ink md:text-2xl">
          {greeting}{name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">Let&apos;s set up your khata.</p>
        <div className="mt-6">
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="No transactions yet"
            body="Tap the ＋ button and record your first expense — it only needs an amount and a category."
          />
        </div>
        <div className="mt-6">
          <QuickActions />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 md:px-6 md:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">
            {greeting}{name ? `, ${name}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{formatMonth(month)} at a glance</p>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-sm font-medium text-[var(--brand-text)] hover:underline"
        >
          All transactions <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* ---------- Headline figures ---------- */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Current balance"
          value={money(currentBalance)}
          tone={currentBalance < 0 ? "expense" : "brand"}
          icon={<Wallet className="h-4 w-4" />}
          sub={`${accounts.filter((a) => !a.is_archived).length} account${accounts.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Total income"
          value={money(allTime.income)}
          tone="income"
          icon={<TrendingUp className="h-4 w-4" />}
          sub="All time"
        />
        <StatCard
          label="Total expenses"
          value={money(allTime.expenses)}
          tone="expense"
          icon={<TrendingDown className="h-4 w-4" />}
          sub="All time"
        />
        <StatCard
          label="Savings"
          value={money(allTime.net)}
          tone={allTime.net >= 0 ? "brand" : "expense"}
          icon={<PiggyBank className="h-4 w-4" />}
          sub={`${formatPercent(savingsRate(allTime), 1)} of income kept`}
        />
      </section>

      <section aria-label="Spending periods" className="mt-3 grid grid-cols-3 gap-3">
        <StatCard
          label="Today"
          value={money(todayTotals.expenses)}
          icon={<CalendarDays className="h-4 w-4" />}
          tone="neutral"
        />
        <StatCard
          label="This week"
          value={money(weekTotals.expenses)}
          icon={<CalendarRange className="h-4 w-4" />}
          tone="neutral"
        />
        <StatCard
          label="This month"
          value={money(monthTotals.expenses)}
          icon={<CalendarRange className="h-4 w-4" />}
          tone="neutral"
          sub={
            monthSavings >= 0
              ? `Saved ${money(monthSavings)} (${formatPercent(rate, 0)})`
              : `Over by ${money(Math.abs(monthSavings))}`
          }
        />
      </section>

      {/* ---------- Quick actions ---------- */}
      <section className="mt-5">
        <QuickActions />
      </section>

      {/* ---------- Charts ---------- */}
      <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily spending · {formatMonth(month)}</CardTitle>
            <span className="tnum text-xs font-semibold text-muted">
              {money(monthTotals.expenses)}
            </span>
          </CardHeader>
          {monthTotals.expenses > 0 ? (
            <DailyExpenseBar data={daily} symbol={symbol} />
          ) : (
            <p className="py-12 text-center text-xs text-muted">
              Nothing spent this month yet.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          {byCategory.length > 0 ? (
            <>
              <CategoryDonut data={byCategory} symbol={symbol} />
              <ul className="mt-3 space-y-1.5">
                {byCategory.slice(0, 5).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: c.color || undefined }}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
                    <span className="tnum font-semibold text-ink">{money(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-12 text-center text-xs text-muted">No expenses to break down yet.</p>
          )}
        </Card>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Income vs expense · last 6 months</CardTitle>
          </CardHeader>
          <IncomeVsExpense data={trend} symbol={symbol} />
        </Card>

        {/* ---------- Budgets ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
            <Link href="/budgets" className="text-xs font-medium text-[var(--brand-text)] hover:underline">
              Manage
            </Link>
          </CardHeader>
          {budgetRows.length === 0 ? (
            <div className="py-6 text-center">
              <Target className="mx-auto mb-2 h-6 w-6 text-faint" />
              <p className="text-xs text-muted">No budgets set.</p>
              <Link
                href="/budgets"
                className="mt-2 inline-block text-xs font-medium text-[var(--brand-text)] hover:underline"
              >
                Set a monthly budget
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {budgetRows.map((b) => (
                <li key={b.budgetId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-ink">{b.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted">
                      {money(b.spent)} / {money(b.amount)}
                    </span>
                  </div>
                  <Meter pct={b.pct} state={b.state} />
                  <p className="mt-1 text-[11px] text-faint">
                    {b.state === "exceeded"
                      ? `Over by ${money(Math.abs(b.remaining))}`
                      : `${money(b.remaining)} left`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ---------- Recent + side panels ---------- */}
      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentTransactions transactions={txns.slice(0, 8)} />
        </div>

        <div className="space-y-4">
          {/* Khata summary */}
          <Card>
            <CardHeader>
              <CardTitle>Khata</CardTitle>
              <Link href="/khata" className="text-xs font-medium text-[var(--brand-text)] hover:underline">
                Open
              </Link>
            </CardHeader>
            {khataOwedToMe === 0 && khataIOwe === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                No money lent or borrowed.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-income-soft px-3 py-2">
                  <span className="text-xs text-muted">They owe you</span>
                  <span className="tnum text-sm font-semibold text-income">
                    {money(khataOwedToMe)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-expense-soft px-3 py-2">
                  <span className="text-xs text-muted">You owe</span>
                  <span className="tnum text-sm font-semibold text-expense">
                    {money(khataIOwe)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Upcoming bills */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming bills</CardTitle>
              <Link href="/recurring" className="text-xs font-medium text-[var(--brand-text)] hover:underline">
                All
              </Link>
            </CardHeader>
            {upcomingBills.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No recurring bills set up.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingBills.map((r) => {
                  const due = r.next_run ? relativeDue(r.next_run) : null;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {r.title ?? r.note ?? "Bill"}
                        </p>
                        {due && (
                          <Badge tone={due.overdue ? "danger" : "neutral"}>{due.label}</Badge>
                        )}
                      </div>
                      <span className="tnum shrink-0 text-xs font-semibold text-ink">
                        {money(r.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
