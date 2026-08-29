"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodNav } from "@/components/layout/PeriodNav";
import { CategoryBreakdown } from "@/components/period/CategoryBreakdown";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import { useAppData } from "@/context/AppDataContext";
import { breakdownBy, dayKey, totalsForDay } from "@/lib/analytics";
import { friendlyDay, shiftDay, todayISO } from "@/lib/date";
import type { TransactionWithTags } from "@/types";

export function DailyClient({ transactions }: { transactions: TransactionWithTags[] }) {
  const { categories, money } = useAppData();
  const [day, setDay] = useState(todayISO());
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);

  const dayTxns = useMemo(
    () => transactions.filter((t) => dayKey(t.transaction_date) === day),
    [transactions, day]
  );

  const totals = useMemo(() => totalsForDay(transactions, day), [transactions, day]);
  const slices = useMemo(
    () => breakdownBy(dayTxns, "category_id", categories, "expense"),
    [dayTxns, categories]
  );

  const isToday = day === todayISO();

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Daily khata" sub="One day at a time" />

      <PeriodNav
        className="mb-4"
        label={friendlyDay(day)}
        isCurrent={isToday}
        onPrev={() => setDay((d) => shiftDay(d, -1))}
        onNext={() => setDay((d) => shiftDay(d, 1))}
        onToday={() => setDay(todayISO())}
        nextDisabled={day >= todayISO()}
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

      {dayTxns.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title={isToday ? "Nothing recorded today" : "Nothing on this day"}
          body={
            isToday
              ? "Tap ＋ to log an expense — it takes about three seconds."
              : "Use the arrows to look at another day."
          }
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-2">
            <div className="divide-y divide-[var(--border)]">
              {dayTxns.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onEdit={setEditing} />
              ))}
            </div>
          </Card>

          {slices.length > 0 && <CategoryBreakdown slices={slices} title="Where it went" />}
        </div>
      )}

      <EditTransactionModal tx={editing} open={!!editing} onClose={() => setEditing(null)} />
    </div>
  );
}
