"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreVertical, Pencil, Trash2, Copy, RotateCcw, ArrowRight, Paperclip,
} from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Badge } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { hourMinute } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  deleteTransaction,
  duplicateTransaction,
} from "@/app/actions/transactions";
import type { TransactionWithTags } from "@/types";

/**
 * A single transaction line with its inline actions
 * (edit · duplicate · repeat · delete). Deletion is undoable from the toast.
 */
export function TransactionRow({
  tx,
  onEdit,
  showTime = true,
  className,
}: {
  tx: TransactionWithTags;
  onEdit?: (tx: TransactionWithTags) => void;
  showTime?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, accounts, vendors, tags, paymentMethods, money } = useAppData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c.id === tx.category_id);
  const account = accounts.find((a) => a.id === tx.account_id);
  const toAccount = accounts.find((a) => a.id === tx.transfer_to_account_id);
  const vendor = vendors.find((v) => v.id === tx.vendor_id);
  const method = paymentMethods.find((m) => m.id === tx.payment_method_id);
  const rowTags = tags.filter((t) => tx.tag_ids.includes(t.id));

  const isExpense = tx.type === "expense";
  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";

  const title =
    tx.note ||
    (isTransfer
      ? `${account?.name ?? "Account"} → ${toAccount?.name ?? "Account"}`
      : category?.name ?? "Transaction");

  const meta = [
    isTransfer ? "Transfer" : category?.name,
    vendor?.name,
    account?.name,
    method?.name,
    showTime ? hourMinute(tx.transaction_date) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleDelete() {
    setBusy(true);
    const res = await deleteTransaction(tx.id);
    setBusy(false);
    if (res.ok) {
      toast("Transaction deleted.", { type: "info" });
      router.refresh();
    } else {
      toast(res.error, { type: "error" });
    }
  }

  async function handleCopy(mode: "duplicate" | "repeat") {
    setBusy(true);
    setMenuOpen(false);
    const res = await duplicateTransaction(tx.id, mode);
    setBusy(false);
    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    const newId = res.data.id;
    toast(mode === "repeat" ? "Logged again for today." : "Copied.", {
      action: {
        label: "Undo",
        onClick: async () => {
          await deleteTransaction(newId);
          router.refresh();
        },
      },
    });
    router.refresh();
  }

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2",
          busy && "opacity-50",
          className
        )}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: (category?.color ?? (isTransfer ? "#3b82f6" : "#64748b")) + "22",
            color: category?.color ?? (isTransfer ? "#3b82f6" : undefined),
          }}
        >
          {isTransfer ? (
            <ArrowRight className="h-5 w-5" />
          ) : (
            <CategoryIcon name={category?.icon} className="h-5 w-5" />
          )}
        </div>

        <button
          onClick={() => onEdit?.(tx)}
          disabled={!onEdit}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink">{title}</p>
            {tx.is_recurring && (
              <RotateCcw className="h-3 w-3 shrink-0 text-faint" aria-label="Recurring" />
            )}
            {(tx.receipt_count ?? 0) > 0 && (
              <Paperclip className="h-3 w-3 shrink-0 text-faint" aria-label="Has receipt" />
            )}
          </div>
          <p className="truncate text-xs text-muted">{meta}</p>
          {rowTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {rowTags.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: (t.color ?? "#64748b") + "22",
                    color: t.color ?? "var(--text-muted)",
                  }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <div
            className={cn(
              "tnum text-right text-sm font-semibold",
              isExpense && "text-expense",
              isIncome && "text-income",
              isTransfer && "text-info"
            )}
          >
            {isExpense ? "−" : isIncome ? "+" : ""}
            {money(tx.amount)}
            {tx.qty ? (
              <span className="block text-[10px] font-normal text-faint">
                {tx.qty} × {money(Number(tx.unit_price ?? 0))}
              </span>
            ) : null}
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={`Actions for ${title}`}
              aria-expanded={menuOpen}
              className="rounded-lg p-1.5 text-faint opacity-0 transition-opacity hover:bg-line hover:text-ink focus:opacity-100 group-hover:opacity-100 md:opacity-0"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl">
                  {onEdit && (
                    <MenuItem
                      icon={<Pencil className="h-4 w-4" />}
                      label="Edit"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(tx);
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<RotateCcw className="h-4 w-4" />}
                    label="Repeat today"
                    onClick={() => handleCopy("repeat")}
                  />
                  <MenuItem
                    icon={<Copy className="h-4 w-4" />}
                    label="Duplicate"
                    onClick={() => handleCopy("duplicate")}
                  />
                  <MenuItem
                    icon={<Trash2 className="h-4 w-4" />}
                    label="Delete"
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmOpen(true);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete this transaction?"
        body={
          <>
            <strong className="text-ink">{title}</strong> — {money(tx.amount)}. Your balances
            and reports will update straight away.
          </>
        }
      />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
        destructive ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-2"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Compact read-only variant for dashboards and calendar popovers. */
export function TransactionRowStatic({ tx }: { tx: TransactionWithTags }) {
  const { categories, accounts, money } = useAppData();
  const category = categories.find((c) => c.id === tx.category_id);
  const account = accounts.find((a) => a.id === tx.account_id);
  const isExpense = tx.type === "expense";
  const isIncome = tx.type === "income";

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: (category?.color ?? "#64748b") + "22", color: category?.color ?? undefined }}
      >
        <CategoryIcon name={category?.icon} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {tx.note || category?.name || "Transaction"}
        </p>
        <p className="truncate text-xs text-muted">
          {[category?.name, account?.name, hourMinute(tx.transaction_date)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span
        className={cn(
          "tnum shrink-0 text-sm font-semibold",
          isExpense ? "text-expense" : isIncome ? "text-income" : "text-info"
        )}
      >
        {isExpense ? "−" : isIncome ? "+" : ""}
        {money(tx.amount)}
      </span>
    </div>
  );
}

export { Badge };
