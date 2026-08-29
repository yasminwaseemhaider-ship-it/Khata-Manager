"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Receipt, Download, CheckSquare, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, Field, Input, Select, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TransactionRow } from "@/components/transaction/TransactionRow";
import { EditTransactionModal } from "@/components/transaction/EditTransactionModal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { deleteTransactions } from "@/app/actions/transactions";
import { groupByDay } from "@/lib/analytics";
import { friendlyDay } from "@/lib/date";
import { downloadCsv, transactionsToRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { TransactionWithTags } from "@/types";

type Tab = "all" | "expense" | "income" | "transfer";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
];

const EMPTY_FILTERS = {
  from: "",
  to: "",
  categoryId: "",
  accountId: "",
  methodId: "",
  vendorId: "",
  minAmount: "",
  maxAmount: "",
  tagIds: [] as string[],
};

export function TransactionsClient({
  transactions,
}: {
  transactions: TransactionWithTags[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, accounts, paymentMethods, vendors, tags, symbol, money } = useAppData();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [editing, setEditing] = useState<TransactionWithTags | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const activeFilterCount =
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.accountId ? 1 : 0) +
    (filters.methodId ? 1 : 0) +
    (filters.vendorId ? 1 : 0) +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0) +
    filters.tagIds.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = filters.minAmount ? Number(filters.minAmount) : null;
    const max = filters.maxAmount ? Number(filters.maxAmount) : null;
    const fromMs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
    const toMs = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;

    const catName = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    const venName = new Map(vendors.map((v) => [v.id, v.name.toLowerCase()]));

    return transactions.filter((t) => {
      if (tab !== "all" && t.type !== tab) return false;

      if (q) {
        const haystack = [
          t.note ?? "",
          catName.get(t.category_id ?? "") ?? "",
          venName.get(t.vendor_id ?? "") ?? "",
          String(t.amount),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      const ms = new Date(t.transaction_date).getTime();
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;

      if (filters.categoryId && t.category_id !== filters.categoryId) return false;
      if (
        filters.accountId &&
        t.account_id !== filters.accountId &&
        t.transfer_to_account_id !== filters.accountId
      )
        return false;
      if (filters.methodId && t.payment_method_id !== filters.methodId) return false;
      if (filters.vendorId && t.vendor_id !== filters.vendorId) return false;
      if (min !== null && Number(t.amount) < min) return false;
      if (max !== null && Number(t.amount) > max) return false;
      if (filters.tagIds.length && !filters.tagIds.some((id) => t.tag_ids.includes(id)))
        return false;

      return true;
    });
  }, [transactions, tab, query, filters, categories, vendors]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const totals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of filtered) {
      if (t.type === "expense") expenses += Number(t.amount);
      else if (t.type === "income") income += Number(t.amount);
    }
    return { income, expenses, net: income - expenses };
  }, [filtered]);

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleBulkDelete() {
    const res = await deleteTransactions(selected);
    if (res.ok) {
      toast(`${selected.length} transaction${selected.length === 1 ? "" : "s"} deleted.`, {
        type: "info",
      });
      setSelected([]);
      router.refresh();
    } else {
      toast(res.error, { type: "error" });
    }
  }

  function handleExport() {
    downloadCsv(
      `khata-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      transactionsToRows(filtered, { categories, accounts, paymentMethods, vendors, tags })
    );
    toast(`Exported ${filtered.length} transactions.`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Transactions"
        sub={`${filtered.length} of ${transactions.length} shown`}
        action={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        }
      />

      {/* ---------- Tabs ---------- */}
      <div role="tablist" aria-label="Transaction type" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Search + filter toggle ---------- */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, categories, vendors, amounts…"
            className="pl-9"
            aria-label="Search transactions"
            type="search"
          />
        </div>
        <Button
          variant={activeFilterCount > 0 ? "subtle" : "outline"}
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* ---------- Filter panel ---------- */}
      {showFilters && (
        <Card className="mb-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="From" htmlFor="f-from">
              <Input
                id="f-from"
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </Field>
            <Field label="To" htmlFor="f-to">
              <Input
                id="f-to"
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </Field>
            <Field label="Category" htmlFor="f-cat">
              <Select
                id="f-cat"
                value={filters.categoryId}
                onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">Any</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Account" htmlFor="f-acc">
              <Select
                id="f-acc"
                value={filters.accountId}
                onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))}
              >
                <option value="">Any</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Payment method" htmlFor="f-pm">
              <Select
                id="f-pm"
                value={filters.methodId}
                onChange={(e) => setFilters((f) => ({ ...f, methodId: e.target.value }))}
              >
                <option value="">Any</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor" htmlFor="f-vendor">
              <Select
                id="f-vendor"
                value={filters.vendorId}
                onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">Any</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={`Min amount (${symbol})`} htmlFor="f-min">
              <Input
                id="f-min"
                inputMode="decimal"
                value={filters.minAmount}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minAmount: e.target.value.replace(/[^0-9.]/g, "") }))
                }
              />
            </Field>
            <Field label={`Max amount (${symbol})`} htmlFor="f-max">
              <Input
                id="f-max"
                inputMode="decimal"
                value={filters.maxAmount}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, maxAmount: e.target.value.replace(/[^0-9.]/g, "") }))
                }
              />
            </Field>
          </div>

          {tags.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = filters.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      aria-pressed={on}
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          tagIds: on
                            ? f.tagIds.filter((x) => x !== t.id)
                            : [...f.tagIds, t.id],
                        }))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        on
                          ? "border-[var(--brand)] bg-brand-soft text-[var(--brand-text)]"
                          : "border-line text-muted hover:text-ink"
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="h-4 w-4" /> Clear filters
            </Button>
          </div>
        </Card>
      )}

      {/* ---------- Totals for the current view ---------- */}
      {filtered.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-3">
          <div>
            <p className="text-[11px] text-muted">Income</p>
            <p className="tnum text-sm font-semibold text-income">{money(totals.income)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Expenses</p>
            <p className="tnum text-sm font-semibold text-expense">{money(totals.expenses)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Net</p>
            <p
              className={cn(
                "tnum text-sm font-semibold",
                totals.net >= 0 ? "text-income" : "text-expense"
              )}
            >
              {money(totals.net)}
            </p>
          </div>
        </div>
      )}

      {/* ---------- Bulk selection bar ---------- */}
      {selected.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--brand)] bg-brand-soft px-3 py-2">
          <span className="text-xs font-medium text-[var(--brand-text)]">
            {selected.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmBulk(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* ---------- List, grouped by day ---------- */}
      {grouped.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title={
            transactions.length === 0 ? "No transactions yet" : "Nothing matches those filters"
          }
          body={
            transactions.length === 0
              ? "Tap ＋ to record your first expense — amount and category are all you need."
              : "Try widening the date range or clearing a filter."
          }
          actionLabel={transactions.length > 0 ? "Clear filters" : undefined}
          onAction={() => {
            setFilters(EMPTY_FILTERS);
            setQuery("");
            setTab("all");
          }}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.day}>
              <header className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-2 bg-bg/95 px-1 py-1.5 backdrop-blur">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {friendlyDay(group.day)}
                </h2>
                <div className="tnum flex gap-3 text-xs">
                  {group.income > 0 && (
                    <span className="font-semibold text-income">+{money(group.income)}</span>
                  )}
                  {group.expense > 0 && (
                    <span className="font-semibold text-expense">−{money(group.expense)}</span>
                  )}
                </div>
              </header>

              <Card className="p-2">
                <div className="divide-y divide-[var(--border)]">
                  {group.items.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-1">
                      <button
                        onClick={() => toggleSelect(tx.id)}
                        aria-label={selected.includes(tx.id) ? "Deselect" : "Select"}
                        aria-pressed={selected.includes(tx.id)}
                        className="shrink-0 rounded p-1 text-faint hover:text-ink"
                      >
                        {selected.includes(tx.id) ? (
                          <CheckSquare className="h-4 w-4 text-[var(--brand)]" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                      <TransactionRow tx={tx} onEdit={setEditing} className="flex-1" />
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}

      <EditTransactionModal tx={editing} open={!!editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selected.length} transaction${selected.length === 1 ? "" : "s"}?`}
        body="This cannot be undone. Balances and reports will update immediately."
      />
    </div>
  );
}
