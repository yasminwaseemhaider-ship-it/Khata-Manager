"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, TrendingDown, TrendingUp, PiggyBank } from "lucide-react";
import { Card, CardHeader, CardTitle, StatCard, SectionTitle, Meter } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodNav } from "@/components/layout/PeriodNav";
import { CategoryBreakdown } from "@/components/period/CategoryBreakdown";
import { DailyExpenseBar } from "@/components/charts/DashboardCharts";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import { useAppData } from "@/context/AppDataContext";
import {
  breakdownBy, budgetProgress, dailyExpenses, groupByDay, monthKeyOf,
  savingsRate, totalsForMonth,
} from "@/lib/analytics";
import { currentMonthKey, formatMonth, friendlyDay, shiftMonth } from "@/lib/date";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Budget, TransactionWithTags } from "@/types";

export function MonthlyClient({
  transactions,
  budgets,
}: {
  transactions: TransactionWithTags[];
  budgets: Budget[];
}) {
  const { categories, settings, symbol, money } = useAppData();
  const [month, setMonth] = useState(currentMonthKey());
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);

  const monthTxns = useMemo(
    () => transactions.filter((t) => monthKeyOf(t.transaction_date) === month),
    [transactions, month]
  );

  const totals = useMemo(() => totalsForMonth(transactions, month), [transactions, month]);
  const prevTotals = useMemo(
    () => totalsForMonth(transactions, shiftMonth(month, -1)),
    [transactions, month]
  );
  const daily = useMemo(() => dailyExpenses(transactions, month), [transactions, month]);
  const slices = useMemo(
    () => breakdownBy(monthTxns, "category_id", categories, "expense"),
    [monthTxns, categories]
  );
  const days = useMemo(() => groupByDay(monthTxns), [monthTxns]);

  const budgetRows = useMemo(() => {
    // Mid-month keeps the window unambiguous regardless of month length.
    const [y, m] = month.split("-").map(Number);
    const refDate = new Date(y, m - 1, 15);
    return budgets
      .filter((b) => b.is_active && b.period === "monthly")
      .map((b) => budgetProgress(b, transactions, categories, refDate, settings.week_starts_on));
  }, [budgets, transactions, categories, month, settings.week_starts_on]);

  const change =
    prevTotals.expenses > 0
      ? ((totals.expenses - prevTotals.expenses) / prevTotals.expenses) * 100
      : null;

  const isCurrent = month === currentMonthKey();
  const activeDays = days.length;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Monthly khata" sub="Income, spending and savings by month" />

      <PeriodNav
        className="mb-4"
        label={formatMonth(month)}
        isCurrent={isCurrent}
        onPrev={() => setMonth((k) => shiftMonth(k, -1))}
        onNext={() => setMonth((k) => shiftMonth(k, 1))}
        onToday={() => setMonth(currentMonthKey())}
        nextDisabled={month >= currentMonthKey()}
      />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={money(totals.income)}
          tone="income"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Expenses"
          value={money(totals.expenses)}
          tone="expense"
          icon={<TrendingDown className="h-4 w-4" />}
          sub={
            change !== null ? (
              <span className={change > 0 ? "text-expense" : "text-income"}>
                {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs last month
              </span>
            ) : undefined
          }
        />
        <StatCard
          label="Balance"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "brand" : "expense"}
        />
        <StatCard
          label="Savings"
          value={money(Math.max(0, totals.net))}
          tone="brand"
          icon={<PiggyBank className="h-4 w-4" />}
          sub={`${formatPercent(savingsRate(totals), 1)} of income`}
        />
      </section>

      {monthTxns.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" />}
          title="Nothing recorded this month"
          body="Once you log expenses they will be summarised here."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily spending</CardTitle>
              <span className="text-xs text-muted">
                {activeDays} active {activeDays === 1 ? "day" : "days"} · avg{" "}
                <span className="tnum font-semibold text-ink">
                  {money(activeDays ? totals.expenses / activeDays : 0)}
                </span>
              </span>
            </CardHeader>
            <DailyExpenseBar data={daily} symbol={symbol} />
          </Card>

          {budgetRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Budgets this month</CardTitle>
                <Link href="/budgets" className="text-xs font-medium text-[var(--brand-text)] hover:underline">
                  Manage
                </Link>
              </CardHeader>
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
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <CategoryBreakdown slices={slices} />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Day by day</h2>
            <div className="space-y-3">
              {days.map((group) => (
                <Card key={group.day} className="p-2">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-xs font-semibold text-muted">
                      {friendlyDay(group.day)}
                    </span>
                    <div className="tnum flex gap-3 text-xs">
                      {group.income > 0 && (
                        <span className="font-semibold text-income">+{money(group.income)}</span>
                      )}
                      {group.expense > 0 && (
                        <span className="font-semibold text-expense">−{money(group.expense)}</span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {group.items.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onEdit={setEditing} />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      <EditTransactionModal tx={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}
