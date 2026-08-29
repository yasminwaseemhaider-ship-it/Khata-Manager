"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus, Check, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Field, Input, Select, Badge, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createReminder, updateReminder, toggleReminder, deleteReminder,
} from "@/app/actions/recurring";
import { formatDate, relativeDue, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/types";

const EMPTY = {
  title: "",
  due_date: todayISO(),
  amount: "",
  category_id: "",
  repeat: "",
  notify_me: true,
};

export function RemindersClient({ reminders }: { reminders: Reminder[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, money } = useAppData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);
  const overdue = open.filter(
    (r) => r.due_date && relativeDue(r.due_date).overdue
  );

  const totalDue = open.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEdit(r: Reminder) {
    setEditing(r);
    setForm({
      title: r.title,
      due_date: r.due_date ?? todayISO(),
      amount: r.amount != null ? String(r.amount) : "",
      category_id: r.category_id ?? "",
      repeat: r.repeat ?? "",
      notify_me: r.notify_me,
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      due_date: form.due_date || null,
      amount: form.amount || null,
      category_id: form.category_id || null,
      repeat: form.repeat || null,
      notify_me: form.notify_me,
    };
    const res = editing
      ? await updateReminder(editing.id, payload)
      : await createReminder(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Reminder updated." : "Reminder added.");
    setShowForm(false);
    router.refresh();
  }

  async function handleToggle(r: Reminder) {
    setBusy(r.id);
    const res = await toggleReminder(r.id, !r.done);
    setBusy(null);
    if (res.ok) router.refresh();
    else toast(res.error, { type: "error" });
  }

  async function handleDelete(r: Reminder) {
    setBusy(r.id);
    const res = await deleteReminder(r.id);
    setBusy(null);
    if (res.ok) {
      toast("Reminder deleted.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  function renderRow(r: Reminder) {
    const due = r.due_date ? relativeDue(r.due_date) : null;
    const category = categories.find((c) => c.id === r.category_id);

    return (
      <div
        key={r.id}
        className={cn("flex items-center gap-3 px-2 py-2.5", busy === r.id && "opacity-50")}
      >
        <button
          onClick={() => handleToggle(r)}
          aria-label={r.done ? `Reopen ${r.title}` : `Mark ${r.title} done`}
          aria-pressed={r.done}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            r.done
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-line hover:border-[var(--brand)]"
          )}
        >
          {r.done && <Check className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                r.done ? "text-faint line-through" : "text-ink"
              )}
            >
              {r.title}
            </span>
            {!r.done && due && (
              <Badge tone={due.overdue ? "danger" : "neutral"}>{due.label}</Badge>
            )}
            {r.repeat && <Badge tone="info">{r.repeat}</Badge>}
          </div>
          <p className="truncate text-xs text-muted">
            {[r.due_date ? formatDate(r.due_date) : null, category?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {r.amount != null && (
          <span className="tnum shrink-0 text-sm font-semibold text-ink">
            {money(Number(r.amount))}
          </span>
        )}

        <div className="flex shrink-0 gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-danger"
            onClick={() => handleDelete(r)}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle
        title="Reminders"
        sub="One-off things to pay or do"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New reminder</span>
          </Button>
        }
      />

      <section className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Open" value={String(open.length)} tone="neutral" />
        <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length ? "warning" : "neutral"} />
        <StatCard label="Amount due" value={money(totalDue)} tone="expense" />
      </section>

      {reminders.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No reminders"
          body="Add a one-off reminder — a school fee, an insurance premium, anything you must not forget. For things that repeat every month, use Bills & recurring instead."
          actionLabel="Add a reminder"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-4">
          {open.length > 0 && (
            <Card className="p-2">
              <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                To do · {open.length}
              </h2>
              <div className="divide-y divide-[var(--border)]">{open.map(renderRow)}</div>
            </Card>
          )}

          {done.length > 0 && (
            <Card className="p-2">
              <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Done · {done.length}
              </h2>
              <div className="divide-y divide-[var(--border)]">{done.map(renderRow)}</div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit reminder" : "New reminder"}
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
              disabled={!form.title.trim()}
            >
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="What is it?" required htmlFor="rm-title">
            <Input
              id="rm-title"
              data-autofocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Pay school fee"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="rm-due">
              <Input
                id="rm-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </Field>
            <Field label="Amount" htmlFor="rm-amount">
              <Input
                id="rm-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}
              />
            </Field>
          </div>

          <Field label="Category" htmlFor="rm-cat">
            <Select
              id="rm-cat"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Not set</option>
              {categories.filter((c) => !c.is_archived).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Repeats" htmlFor="rm-repeat">
            <Select
              id="rm-repeat"
              value={form.repeat}
              onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value }))}
            >
              <option value="">One-off</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
