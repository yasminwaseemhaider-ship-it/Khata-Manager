"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, Field, Input, Select, Meter, Badge, SectionTitle, StatCard } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { createBudget, updateBudget, deleteBudget } from "@/app/actions/budgets";
import { budgetProgress } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { Budget, TransactionWithTags } from "@/types";

const EMPTY = {
  name: "",
  amount: "",
  period: "monthly" as "monthly" | "weekly" | "yearly",
  category_id: "",
  alert_at_pct: 80,
};

export function BudgetsClient({
  transactions,
  budgets,
}: {
  transactions: TransactionWithTags[];
  budgets: Budget[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, settings, money } = useAppData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Budget | null>(null);

  const expenseCategories = categories.filter((c) => c.type === "expense" && !c.is_archived);

  const rows = useMemo(
    () =>
      budgets.map((b) => ({
        budget: b,
        progress: budgetProgress(b, transactions, categories, new Date(), settings.week_starts_on),
      })),
    [budgets, transactions, categories, settings.week_starts_on]
  );

  const active = rows.filter((r) => r.budget.is_active);
  const totalBudgeted = active.reduce((s, r) => s + r.progress.amount, 0);
  const totalSpent = active.reduce((s, r) => s + r.progress.spent, 0);
  const exceeded = active.filter((r) => r.progress.state === "exceeded").length;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEdit(b: Budget) {
    setEditing(b);
    setForm({
      name: b.name,
      amount: String(b.amount),
      period: b.period,
      category_id: b.category_id ?? "",
      alert_at_pct: b.alert_at_pct,
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      amount: form.amount,
      period: form.period,
      category_id: form.category_id || null,
      alert_at_pct: Number(form.alert_at_pct),
      is_active: true,
    };
    const res = editing ? await updateBudget(editing.id, payload) : await createBudget(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Budget updated." : "Budget created.");
    setShowForm(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteBudget(confirmDelete.id);
    if (res.ok) {
      toast("Budget deleted.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function toggleActive(b: Budget) {
    const res = await updateBudget(b.id, { is_active: !b.is_active });
    if (res.ok) router.refresh();
    else toast(res.error, { type: "error" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Budgets"
        sub="Set a limit per category and watch it as you spend"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New budget</span>
          </Button>
        }
      />

      {active.length > 0 && (
        <section className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="Budgeted" value={money(totalBudgeted)} tone="neutral" />
          <StatCard label="Spent" value={money(totalSpent)} tone="expense" />
          <StatCard
            label="Remaining"
            value={money(totalBudgeted - totalSpent)}
            tone={totalBudgeted - totalSpent >= 0 ? "brand" : "expense"}
            sub={exceeded > 0 ? `${exceeded} over budget` : "All within limits"}
          />
        </section>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" />}
          title="No budgets yet"
          body="Set a monthly limit for groceries or bills and Khata will track your progress automatically."
          actionLabel="Create your first budget"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ budget: b, progress: p }) => (
            <Card key={b.id} className={cn(!b.is_active && "opacity-60")}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{b.name}</h3>
                    {p.state === "exceeded" && (
                      <Badge tone="danger">
                        <AlertTriangle className="h-3 w-3" /> Over
                      </Badge>
                    )}
                    {p.state === "warning" && <Badge tone="warning">Nearly there</Badge>}
                    {p.state === "ok" && (
                      <Badge tone="income">
                        <CheckCircle2 className="h-3 w-3" /> On track
                      </Badge>
                    )}
                    {!b.is_active && <Badge>Paused</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.categoryName} · {b.period} · {p.periodLabel}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => openEdit(b)} aria-label="Edit budget">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => setConfirmDelete(b)}
                    aria-label="Delete budget"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Meter pct={p.pct} state={p.state} />

              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
                <span className="text-muted">
                  Spent <span className="tnum font-semibold text-ink">{money(p.spent)}</span> of{" "}
                  <span className="tnum font-semibold text-ink">{money(p.amount)}</span>
                </span>
                <span
                  className={cn(
                    "tnum font-semibold",
                    p.remaining >= 0 ? "text-income" : "text-expense"
                  )}
                >
                  {p.remaining >= 0
                    ? `${money(p.remaining)} left`
                    : `${money(Math.abs(p.remaining))} over`}
                  <span className="ml-1.5 font-normal text-faint">({p.pct.toFixed(0)}%)</span>
                </span>
              </div>

              <button
                onClick={() => toggleActive(b)}
                className="mt-2 text-[11px] font-medium text-muted hover:text-ink hover:underline"
              >
                {b.is_active ? "Pause this budget" : "Resume this budget"}
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit budget" : "New budget"}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              loading={saving}
              disabled={!form.name.trim() || !form.amount}
            >
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required htmlFor="b-name">
            <Input
              id="b-name"
              data-autofocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Monthly groceries"
            />
          </Field>

          <Field label="Limit" required htmlFor="b-amount">
            <Input
              id="b-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}
              placeholder="0"
              className="tnum font-semibold"
            />
          </Field>

          <Field label="Period" htmlFor="b-period">
            <Select
              id="b-period"
              value={form.period}
              onChange={(e) =>
                setForm((f) => ({ ...f, period: e.target.value as typeof f.period }))
              }
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>

          <Field
            label="Category"
            htmlFor="b-cat"
            hint="Leave blank to budget all of your spending."
          >
            <Select
              id="b-cat"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">All categories</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field
            label={`Warn me at ${form.alert_at_pct}%`}
            htmlFor="b-alert"
            hint="You will see a warning before you go over."
          >
            <input
              id="b-alert"
              type="range"
              min={50}
              max={100}
              step={5}
              value={form.alert_at_pct}
              onChange={(e) => setForm((f) => ({ ...f, alert_at_pct: Number(e.target.value) }))}
              className="w-full accent-[var(--brand)]"
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        body="Your transactions stay — only the budget target is removed."
      />
    </div>
  );
}
