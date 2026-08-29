"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, PiggyBank, CalendarRange } from "lucide-react";
import { Card, CardHeader, CardTitle, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodNav } from "@/components/layout/PeriodNav";
import { CategoryBreakdown } from "@/components/period/CategoryBreakdown";
import { IncomeVsExpense, TrendArea } from "@/components/charts/DashboardCharts";
import { useAppData } from "@/context/AppDataContext";
import {
  breakdownBy, incomeVsExpense, monthlyExpenses, savingsRate, totalsForMonth,
  totalsForYear, yearKeyOf,
} from "@/lib/analytics";
import { currentYearKey, formatMonth, shiftYear } from "@/lib/date";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionWithTags } from "@/types";

export function YearlyClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const { categories, symbol, money } = useAppData();
  const [year, setYear] = useState(currentYearKey());

  const yearTxns = useMemo(
    () => transactions.filter((t) => yearKeyOf(t.transaction_date) === year),
    [transactions, year]
  );

  const totals = useMemo(() => totalsForYear(transactions, year), [transactions, year]);
  const prevTotals = useMemo(
    () => totalsForYear(transactions, shiftYear(year, -1)),
    [transactions, year]
  );

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`),
    [year]
  );
  const monthRows = useMemo(
    () => months.map((k) => ({ key: k, ...totalsForMonth(transactions, k) })),
    [months, transactions]
  );
  const trend = useMemo(() => incomeVsExpense(transactions, months), [transactions, months]);
  const expenseSeries = useMemo(() => monthlyExpenses(transactions, year), [transactions, year]);
  const slices = useMemo(
    () => breakdownBy(yearTxns, "category_id", categories, "expense"),
    [yearTxns, categories]
  );

  const activeMonths = monthRows.filter((r) => r.expenses > 0 || r.income > 0).length;
  const best = monthRows.reduce(
    (a, b) => (b.net > a.net ? b : a),
    monthRows[0] ?? { key: "", income: 0, expenses: 0, net: 0 }
  );
  const heaviest = monthRows.reduce(
    (a, b) => (b.expenses > a.expenses ? b : a),
    monthRows[0] ?? { key: "", income: 0, expenses: 0, net: 0 }
  );

  const change =
    prevTotals.expenses > 0
      ? ((totals.expenses - prevTotals.expenses) / prevTotals.expenses) * 100
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Yearly summary" sub="The whole year on one screen" />

      <PeriodNav
        className="mb-4"
        label={year}
        isCurrent={year === currentYearKey()}
        onPrev={() => setYear((k) => shiftYear(k, -1))}
        onNext={() => setYear((k) => shiftYear(k, 1))}
        onToday={() => setYear(currentYearKey())}
        nextDisabled={year >= currentYearKey()}
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
                {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs {shiftYear(year, -1)}
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
          label="Savings rate"
          value={formatPercent(savingsRate(totals), 1)}
          tone="brand"
          icon={<PiggyBank className="h-4 w-4" />}
          sub={`Avg ${money(activeMonths ? totals.expenses / activeMonths : 0)}/month`}
        />
      </section>

      {yearTxns.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" />}
          title={`Nothing recorded in ${year}`}
          body="Pick another year with the arrows above."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Income vs expense by month</CardTitle>
            </CardHeader>
            <IncomeVsExpense data={trend} symbol={symbol} height={280} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spending trend</CardTitle>
              <span className="text-xs text-muted">
                Heaviest: {heaviest.key ? formatMonth(heaviest.key) : "—"}
              </span>
            </CardHeader>
            <TrendArea data={expenseSeries} symbol={symbol} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Month by month</CardTitle>
              <span className="text-xs text-muted">
                Best saving month: {best.key ? formatMonth(best.key) : "—"}
              </span>
            </CardHeader>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 py-2 font-medium">Month</th>
                    <th className="px-2 py-2 text-right font-medium">Income</th>
                    <th className="px-2 py-2 text-right font-medium">Expenses</th>
                    <th className="px-2 py-2 text-right font-medium">Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {monthRows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-2 py-2 text-ink">{formatMonth(r.key).split(" ")[0]}</td>
                      <td className="tnum px-2 py-2 text-right text-income">
                        {r.income ? money(r.income) : "—"}
                      </td>
                      <td className="tnum px-2 py-2 text-right text-expense">
                        {r.expenses ? money(r.expenses) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tnum px-2 py-2 text-right font-semibold",
                          r.net > 0 ? "text-income" : r.net < 0 ? "text-expense" : "text-faint"
                        )}
                      >
                        {r.income || r.expenses ? money(r.net) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-strong)] font-semibold">
                    <td className="px-2 py-2 text-ink">Total</td>
                    <td className="tnum px-2 py-2 text-right text-income">{money(totals.income)}</td>
                    <td className="tnum px-2 py-2 text-right text-expense">{money(totals.expenses)}</td>
                    <td
                      className={cn(
                        "tnum px-2 py-2 text-right",
                        totals.net >= 0 ? "text-income" : "text-expense"
                      )}
                    >
                      {money(totals.net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <CategoryBreakdown slices={slices} title={`Categories in ${year}`} />
        </div>
      )}
    </div>
  );
}
