"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodNav } from "@/components/layout/PeriodNav";
import { CategoryBreakdown } from "@/components/period/CategoryBreakdown";
import { TrendArea } from "@/components/charts/DashboardCharts";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import { QuickAddModal } from "@/components/transaction/QuickAddModal";
import { useAppData } from "@/context/AppDataContext";
import {
  breakdownBy, groupByDay, incomeVsExpense, monthKeyOf, recentMonthKeys, totalsForMonth,
} from "@/lib/analytics";
import { currentMonthKey, formatDate, formatMonth, friendlyDay, shiftMonth } from "@/lib/date";
import type { RecurringRule, TransactionWithTags } from "@/types";

export function IncomeClient({
  transactions,
  rules,
}: {
  transactions: TransactionWithTags[];
  rules: RecurringRule[];
}) {
  const { categories, symbol, money } = useAppData();
  const [month, setMonth] = useState(currentMonthKey());
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const incomeTxns = useMemo(
    () => transactions.filter((t) => t.type === "income"),
    [transactions]
  );

  const monthIncome = useMemo(
    () => incomeTxns.filter((t) => monthKeyOf(t.transaction_date) === month),
    [incomeTxns, month]
  );

  const totals = useMemo(() => totalsForMonth(transactions, month), [transactions, month]);
  const allTimeIncome = useMemo(
    () => incomeTxns.reduce((s, t) => s + Number(t.amount), 0),
    [incomeTxns]
  );

  const slices = useMemo(
    () => breakdownBy(monthIncome, "category_id", categories, "income", "Other income"),
    [monthIncome, categories]
  );

  const series = useMemo(() => {
    const months = recentMonthKeys(6);
    return incomeVsExpense(transactions, months).map((d) => ({
      label: formatMonth(d.month).split(" ")[0].slice(0, 3),
      value: d.income,
    }));
  }, [transactions]);

  const days = useMemo(() => groupByDay(monthIncome), [monthIncome]);

  const recurringIncome = rules.filter((r) => r.type === "income" && r.is_active);

  const avgMonthly = useMemo(() => {
    const months = new Set(incomeTxns.map((t) => monthKeyOf(t.transaction_date)));
    return months.size ? allTimeIncome / months.size : 0;
  }, [incomeTxns, allTimeIncome]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Income"
        sub="Salary, business, freelance, rent and everything else coming in"
        action={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add income</span>
          </Button>
        }
      />

      <PeriodNav
        className="mb-4"
        label={formatMonth(month)}
        isCurrent={month === currentMonthKey()}
        onPrev={() => setMonth((k) => shiftMonth(k, -1))}
        onNext={() => setMonth((k) => shiftMonth(k, 1))}
        onToday={() => setMonth(currentMonthKey())}
        nextDisabled={month >= currentMonthKey()}
      />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="This month"
          value={money(totals.income)}
          tone="income"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard label="Expenses" value={money(totals.expenses)} tone="expense" />
        <StatCard
          label="Kept"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "brand" : "expense"}
        />
        <StatCard
          label="Average month"
          value={money(avgMonthly)}
          tone="neutral"
          sub={`${money(allTimeIncome)} all time`}
        />
      </section>

      {recurringIncome.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Recurring income</CardTitle>
            <Link
              href="/recurring"
              className="text-xs font-medium text-[var(--brand-text)] hover:underline"
            >
              Manage
            </Link>
          </CardHeader>
          <ul className="space-y-2">
            {recurringIncome.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.title ?? r.note ?? "Income"}
                  </p>
                  <p className="text-xs text-muted">
                    {r.frequency}
                    {r.next_run ? ` · next ${formatDate(r.next_run)}` : ""}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-semibold text-income">
                  {money(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {incomeTxns.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No income recorded"
          body="Log your salary or any money coming in. For a monthly salary, set it up once under Bills & recurring and it will post itself."
          actionLabel="Add income"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Income over the last 6 months</CardTitle>
            </CardHeader>
            <TrendArea data={series} symbol={symbol} color="#059669" name="Income" />
          </Card>

          {slices.length > 0 && (
            <CategoryBreakdown
              slices={slices}
              title="Income sources"
              emptyText="No income this month."
            />
          )}

          {monthIncome.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No income this month"
              body="Use the arrows above to look at another month."
            />
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">
                {formatMonth(month)} · {monthIncome.length} entr
                {monthIncome.length === 1 ? "y" : "ies"}
              </h2>
              {days.map((group) => (
                <Card key={group.day} className="p-2">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-xs font-semibold text-muted">
                      {friendlyDay(group.day)}
                    </span>
                    <span className="tnum text-xs font-semibold text-income">
                      +{money(group.income)}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {group.items.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onEdit={setEditing} />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <EditTransactionModal tx={editing} open={!!editing} onClose={() => setEditing(null)} />
      <QuickAddModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        preset={{ type: "income" }}
      />
    </div>
  );
}
