"use client";

import { useMemo, useState } from "react";
import { Card, StatCard, SectionTitle } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodNav } from "@/components/layout/PeriodNav";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import { useAppData } from "@/context/AppDataContext";
import { calendarGrid, dayKey, totalsForMonth } from "@/lib/analytics";
import { currentMonthKey, formatMonth, friendlyDay, shiftMonth, todayISO, weekdayHeaders } from "@/lib/date";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionWithTags } from "@/types";

export function CalendarClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const { settings, symbol, money } = useAppData();
  const weekStart = settings.week_starts_on;

  const [month, setMonth] = useState(currentMonthKey());
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);

  const cells = useMemo(
    () => calendarGrid(transactions, month, weekStart),
    [transactions, month, weekStart]
  );
  const totals = useMemo(() => totalsForMonth(transactions, month), [transactions, month]);

  const dayTxns = useMemo(
    () => (openDay ? transactions.filter((t) => dayKey(t.transaction_date) === openDay) : []),
    [transactions, openDay]
  );

  // Scale colour intensity against the busiest day of this month.
  const maxExpense = useMemo(
    () => Math.max(0, ...cells.filter((c) => c.inMonth).map((c) => c.expense)),
    [cells]
  );

  const today = todayISO();
  const headers = weekdayHeaders(weekStart);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Calendar" sub="Tap any date to see that day's transactions" />

      <PeriodNav
        className="mb-4"
        label={formatMonth(month)}
        isCurrent={month === currentMonthKey()}
        onPrev={() => setMonth((k) => shiftMonth(k, -1))}
        onNext={() => setMonth((k) => shiftMonth(k, 1))}
        onToday={() => setMonth(currentMonthKey())}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Spent" value={money(totals.expenses)} tone="expense" />
        <StatCard label="Earned" value={money(totals.income)} tone="income" />
        <StatCard
          label="Net"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "brand" : "expense"}
        />
      </div>

      <Card className="p-2 md:p-3">
        <div className="grid grid-cols-7 gap-1">
          {headers.map((h) => (
            <div
              key={h}
              className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-faint"
            >
              {h}
            </div>
          ))}

          {cells.map((cell) => {
            const intensity =
              maxExpense > 0 && cell.expense > 0 ? Math.min(1, cell.expense / maxExpense) : 0;
            const isToday = cell.date === today;
            const hasActivity = cell.count > 0;

            return (
              <button
                key={cell.date}
                onClick={() => hasActivity && setOpenDay(cell.date)}
                disabled={!hasActivity}
                aria-label={`${friendlyDay(cell.date)}${
                  hasActivity
                    ? `, spent ${money(cell.expense)}, ${cell.count} transactions`
                    : ", no transactions"
                }`}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl border p-1 transition-colors",
                  cell.inMonth ? "border-line" : "border-transparent opacity-35",
                  hasActivity ? "cursor-pointer hover:border-[var(--brand)]" : "cursor-default",
                  isToday && "ring-2 ring-[var(--brand)]"
                )}
                style={
                  intensity > 0
                    ? { backgroundColor: `color-mix(in srgb, var(--expense) ${Math.round(intensity * 22)}%, var(--surface))` }
                    : undefined
                }
              >
                <span
                  className={cn(
                    "text-xs font-semibold",
                    isToday ? "text-[var(--brand-text)]" : "text-ink"
                  )}
                >
                  {Number(cell.date.slice(-2))}
                </span>

                {cell.expense > 0 && (
                  <span className="tnum mt-0.5 text-[9px] font-medium leading-none text-expense">
                    {formatCompact(cell.expense)}
                  </span>
                )}
                {cell.income > 0 && (
                  <span className="tnum text-[9px] font-medium leading-none text-income">
                    +{formatCompact(cell.income)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <p className="mt-3 text-center text-xs text-muted">
        Deeper red means a heavier spending day.
      </p>

      <Modal
        open={!!openDay}
        onClose={() => setOpenDay(null)}
        title={openDay ? friendlyDay(openDay) : ""}
        description={
          dayTxns.length
            ? `${dayTxns.length} transaction${dayTxns.length === 1 ? "" : "s"}`
            : undefined
        }
        size="md"
      >
        {dayTxns.length === 0 ? (
          <EmptyState title="Nothing on this day" className="border-0" />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {dayTxns.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                onEdit={(t) => {
                  setOpenDay(null);
                  setEditing(t);
                }}
              />
            ))}
          </div>
        )}
      </Modal>

      <EditTransactionModal tx={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}
