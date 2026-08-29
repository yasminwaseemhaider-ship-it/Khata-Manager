"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCcw, Plus, Pencil, Trash2, Pause, Play, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, Field, Input, Select, Textarea, Badge, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createRecurring, updateRecurring, deleteRecurring, toggleRecurring, postRecurringNow,
} from "@/app/actions/recurring";
import { formatDate, relativeDue, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Frequency, RecurringRule } from "@/types";

/** Common Pakistani household bills offered as one-tap starting points. */
const PRESETS = [
  { title: "Rent", frequency: "monthly" as Frequency },
  { title: "Electricity", frequency: "monthly" as Frequency },
  { title: "Gas", frequency: "monthly" as Frequency },
  { title: "Internet", frequency: "monthly" as Frequency },
  { title: "School fees", frequency: "monthly" as Frequency },
  { title: "Subscription", frequency: "monthly" as Frequency },
  { title: "Loan instalment", frequency: "monthly" as Frequency },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom (every N days)" },
];

const EMPTY = {
  title: "",
  amount: "",
  type: "expense" as "expense" | "income",
  category_id: "",
  account_id: "",
  payment_method_id: "",
  note: "",
  frequency: "monthly" as Frequency,
  interval_step: 1,
  next_run: todayISO(),
  auto_post: true,
  remind_days_before: 1,
};

export function RecurringClient({ rules }: { rules: RecurringRule[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, accounts, paymentMethods, money } = useAppData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringRule | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const active = rules.filter((r) => r.is_active);
  const monthlyOutgoing = useMemo(
    () =>
      active
        .filter((r) => r.type === "expense")
        .reduce((sum, r) => {
          const perMonth =
            r.frequency === "monthly"
              ? 1 / r.interval_step
              : r.frequency === "weekly"
                ? 4.345 / r.interval_step
                : r.frequency === "yearly"
                  ? 1 / (12 * r.interval_step)
                  : r.frequency === "daily"
                    ? 30.44 / r.interval_step
                    : 30.44 / r.interval_step;
          return sum + Number(r.amount) * perMonth;
        }, 0),
    [active]
  );

  // Captured once on mount: calling Date.now() during render makes the result
  // change on every re-render, which React treats as an impure component.
  const [nowMs] = useState(() => Date.now());
  const dueSoon = active.filter(
    (r) => r.next_run && new Date(r.next_run).getTime() <= nowMs + 7 * 86_400_000
  );

  function openCreate(preset?: (typeof PRESETS)[number]) {
    setEditing(null);
    setForm({
      ...EMPTY,
      title: preset?.title ?? "",
      frequency: preset?.frequency ?? "monthly",
    });
    setError(null);
    setShowForm(true);
  }

  function openEdit(r: RecurringRule) {
    setEditing(r);
    setForm({
      title: r.title ?? "",
      amount: String(r.amount),
      type: r.type,
      category_id: r.category_id ?? "",
      account_id: r.account_id ?? "",
      payment_method_id: r.payment_method_id ?? "",
      note: r.note ?? "",
      frequency: r.frequency,
      interval_step: r.interval_step,
      next_run: r.next_run ?? todayISO(),
      auto_post: r.auto_post,
      remind_days_before: r.remind_days_before,
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      amount: form.amount,
      type: form.type,
      category_id: form.category_id || null,
      account_id: form.account_id || null,
      payment_method_id: form.payment_method_id || null,
      note: form.note || null,
      frequency: form.frequency,
      interval_step: Number(form.interval_step) || 1,
      next_run: form.next_run || null,
      auto_post: form.auto_post,
      remind_days_before: Number(form.remind_days_before),
      is_active: true,
    };
    const res = editing
      ? await updateRecurring(editing.id, payload)
      : await createRecurring(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Bill updated." : "Recurring bill added.");
    setShowForm(false);
    router.refresh();
  }

  async function handlePostNow(r: RecurringRule) {
    setBusy(r.id);
    const res = await postRecurringNow(r.id);
    setBusy(null);
    if (res.ok) {
      toast(`${r.title ?? "Bill"} logged for today.`);
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleToggle(r: RecurringRule) {
    setBusy(r.id);
    const res = await toggleRecurring(r.id, !r.is_active);
    setBusy(null);
    if (res.ok) router.refresh();
    else toast(res.error, { type: "error" });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteRecurring(confirmDelete.id);
    if (res.ok) {
      toast("Recurring bill removed.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  function frequencyLabel(r: RecurringRule) {
    const step = r.interval_step;
    if (r.frequency === "custom") return `Every ${step} day${step === 1 ? "" : "s"}`;
    if (step === 1) return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
    return `Every ${step} ${r.frequency.replace("ly", step > 1 ? "s" : "")}`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Bills & recurring"
        sub="Rent, utilities, subscriptions and salary — logged automatically"
        action={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New bill</span>
          </Button>
        }
      />

      <section className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Active" value={String(active.length)} tone="neutral" />
        <StatCard label="Due within 7 days" value={String(dueSoon.length)} tone="warning" />
        <StatCard
          label="Approx. monthly cost"
          value={money(monthlyOutgoing)}
          tone="expense"
          sub="Averaged across frequencies"
        />
      </section>

      {rules.length === 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted">Start from a common bill:</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.title}
                onClick={() => openCreate(p)}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-[var(--brand)] hover:text-ink"
              >
                + {p.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={<RefreshCcw className="h-5 w-5" />}
          title="No recurring bills yet"
          body="Add rent or a utility bill and Khata will record it on schedule so your budget always reflects it."
          actionLabel="Add a bill"
          onAction={() => openCreate()}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((r) => {
            const due = r.next_run ? relativeDue(r.next_run) : null;
            const category = categories.find((c) => c.id === r.category_id);
            return (
              <Card key={r.id} className={cn(!r.is_active && "opacity-60", busy === r.id && "opacity-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-ink">
                        {r.title ?? r.note ?? "Bill"}
                      </h3>
                      <Badge tone={r.type === "income" ? "income" : "neutral"}>
                        {r.type === "income" ? "Income" : "Expense"}
                      </Badge>
                      {!r.is_active && <Badge>Paused</Badge>}
                      {r.is_active && due && (
                        <Badge tone={due.overdue ? "danger" : "brand"}>{due.label}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {frequencyLabel(r)}
                      {category ? ` · ${category.name}` : ""}
                      {r.next_run ? ` · next ${formatDate(r.next_run)}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {r.auto_post
                        ? "Posts automatically when due"
                        : "Waits for you to confirm each time"}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "tnum shrink-0 text-base font-bold",
                      r.type === "income" ? "text-income" : "text-expense"
                    )}
                  >
                    {money(r.amount)}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Button size="sm" variant="subtle" onClick={() => handlePostNow(r)}>
                    <Zap className="h-3.5 w-3.5" /> Log now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleToggle(r)}>
                    {r.is_active ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Resume
                      </>
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmDelete(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit recurring bill" : "New recurring bill"}
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              loading={saving}
              disabled={!form.title.trim() || !form.amount}
            >
              {editing ? "Save" : "Add bill"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required htmlFor="r-title" className="sm:col-span-2">
            <Input
              id="r-title"
              data-autofocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. K-Electric bill"
            />
          </Field>

          <Field label="Amount" required htmlFor="r-amount">
            <Input
              id="r-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}
              className="tnum font-semibold"
            />
          </Field>

          <Field label="Type" htmlFor="r-type">
            <Select
              id="r-type"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as "expense" | "income", category_id: "" }))
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>

          <Field label="Frequency" htmlFor="r-freq">
            <Select
              id="r-freq"
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Repeat every"
            htmlFor="r-step"
            hint={form.frequency === "custom" ? "days" : undefined}
          >
            <Input
              id="r-step"
              type="number"
              min={1}
              max={365}
              value={form.interval_step}
              onChange={(e) => setForm((f) => ({ ...f, interval_step: Number(e.target.value) }))}
            />
          </Field>

          <Field label="Next due date" htmlFor="r-next">
            <Input
              id="r-next"
              type="date"
              value={form.next_run}
              onChange={(e) => setForm((f) => ({ ...f, next_run: e.target.value }))}
            />
          </Field>

          <Field label="Category" htmlFor="r-cat">
            <Select
              id="r-cat"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Not set</option>
              {categories
                .filter((c) => c.type === form.type && !c.is_archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </Select>
          </Field>

          <Field label="Account" htmlFor="r-acc">
            <Select
              id="r-acc"
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
            >
              <option value="">Default account</option>
              {accounts.filter((a) => !a.is_archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Payment method" htmlFor="r-pm">
            <Select
              id="r-pm"
              value={form.payment_method_id}
              onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}
            >
              <option value="">Not set</option>
              {paymentMethods.filter((m) => !m.is_archived).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Note" htmlFor="r-note" className="sm:col-span-2">
            <Textarea
              id="r-note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.auto_post}
              onChange={(e) => setForm((f) => ({ ...f, auto_post: e.target.checked }))}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            <span className="text-sm text-ink">
              Record automatically when due
              <span className="block text-xs text-muted">
                Turn this off if the amount changes every time (like a utility bill).
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger sm:col-span-2">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete "${confirmDelete?.title ?? "this bill"}"?`}
        body="Transactions already created from it are kept."
      />
    </div>
  );
}
