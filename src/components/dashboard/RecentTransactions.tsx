"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import type { TransactionWithTags } from "@/types";

/** Recent activity with inline edit/duplicate/delete. */
export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionWithTags[];
}) {
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <Link
            href="/transactions"
            className="text-xs font-medium text-[var(--brand-text)] hover:underline"
          >
            See all
          </Link>
        </CardHeader>

        {transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="Nothing recorded yet"
            body="Your latest expenses and income will show up here."
            className="border-0 py-8"
          />
        ) : (
          <div className="-mx-2 divide-y divide-[var(--border)]">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onEdit={setEditing} />
            ))}
          </div>
        )}
      </Card>

      <EditTransactionModal
        tx={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
