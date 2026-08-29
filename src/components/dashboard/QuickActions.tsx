"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus, ArrowLeftRight, ShoppingCart, BookOpen, Target, BarChart3, Repeat,
} from "lucide-react";
import { QuickAddModal } from "@/components/transaction/QuickAddModal";
import type { TxType } from "@/types";

const LINKS = [
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/khata", label: "Khata", icon: BookOpen },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/recurring", label: "Bills", icon: Repeat },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

/** The row of one-tap entry points under the dashboard summary. */
export function QuickActions() {
  const [open, setOpen] = useState<TxType | null>(null);

  const tile =
    "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-3 text-[11px] font-medium text-muted transition-colors hover:border-[var(--brand)] hover:text-ink";

  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        <button
          onClick={() => setOpen("expense")}
          className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-3 py-3 text-sm font-semibold text-white transition-transform active:scale-95 sm:col-span-2"
        >
          <Plus className="h-5 w-5" /> Add expense
        </button>

        <button onClick={() => setOpen("income")} className={tile}>
          <Plus className="h-5 w-5 text-income" />
          Income
        </button>

        <button onClick={() => setOpen("transfer")} className={tile}>
          <ArrowLeftRight className="h-5 w-5 text-info" />
          Transfer
        </button>

        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={tile}>
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>

      <QuickAddModal
        open={open !== null}
        onClose={() => setOpen(null)}
        preset={open ? { type: open } : null}
      />
    </>
  );
}
