"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Plus, ArrowDownLeft, ArrowUpRight, Check, Trash2, Pencil, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, Field, Input, Select, Textarea, Badge, Meter, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createKhataEntry, updateKhataEntry, deleteKhataEntry, addKhataPayment, settleKhataEntry,
} from "@/app/actions/khata";
import { formatDate, relativeDue, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { KhataEntryView, KhataPerson } from "@/types";

type Filter = "all" | "owed" | "owing" | "overdue" | "settled";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owed", label: "They owe me" },
  { value: "owing", label: "I owe" },
  { value: "overdue", label: "Overdue" },
  { value: "settled", label: "Settled" },
];

const EMPTY = {
  person_name: "",
  direction: "owed" as "owed" | "owing",
  amount: "",
  note: "",
  entry_date: todayISO(),
  due_date: "",
};

export function KhataClient({
  entries,
  people,
}: {
  entries: KhataEntryView[];
  people: KhataPerson[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { money } = useAppData();

  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<KhataEntryView | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<KhataEntryView | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<KhataEntryView | null>(null);

  const totals = useMemo(() => {
    let theyOwe = 0;
    let iOwe = 0;
    let overdue = 0;
    for (const e of entries) {
      if (e.remaining <= 0) continue;
      if (e.direction === "owed") theyOwe += e.remaining;
      else iOwe += e.remaining;
      if (e.is_overdue) overdue += e.remaining;
    }
    return { theyOwe, iOwe, net: theyOwe - iOwe, overdue };
  }, [entries]);

  const visible = useMemo(() => {
    switch (filter) {
      case "owed":
        return entries.filter((e) => e.direction === "owed" && e.remaining > 0);
      case "owing":
        return entries.filter((e) => e.direction === "owing" && e.remaining > 0);
      case "overdue":
        return entries.filter((e) => e.is_overdue);
      case "settled":
        return entries.filter((e) => e.remaining <= 0);
      default:
        return entries;
    }
  }, [entries, filter]);

  function openCreate(direction: "owed" | "owing") {
    setEditing(null);
    setForm({ ...EMPTY, direction });
    setError(null);
    setShowForm(true);
  }

  function openEdit(e: KhataEntryView) {
    setEditing(e);
    setForm({
      person_name: e.person_name,
      direction: e.direction,
      amount: String(e.amount),
      note: e.note ?? "",
      entry_date: e.entry_date,
      due_date: e.due_date ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      person_name: form.person_name,
      direction: form.direction,
      amount: form.amount,
      note: form.note || null,
      entry_date: form.entry_date || null,
      due_date: form.due_date || null,
    };
    const res = editing
      ? await updateKhataEntry(editing.id, payload)
      : await createKhataEntry(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(editing ? "Entry updated." : "Khata entry added.");
    setShowForm(false);
    router.refresh();
  }

  async function handlePay() {
    if (!payTarget) return;
    setPaying(true);
    setPayError(null);
    const res = await addKhataPayment({
      khata_entry_id: payTarget.id,
      amount: payAmount,
      note: payNote || null,
    });
    setPaying(false);
    if (!res.ok) {
      setPayError(res.error);
      return;
    }
    toast("Payment recorded.");
    setPayTarget(null);
    setPayAmount("");
    setPayNote("");
    router.refresh();
  }

  async function handleSettle(e: KhataEntryView) {
    const res = await settleKhataEntry(e.id);
    if (res.ok) {
      toast(`${e.person_name}'s khata is settled.`);
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteKhataEntry(confirmDelete.id);
    if (res.ok) {
      toast("Entry deleted.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <SectionTitle title="Khata" sub="Money you have lent and borrowed" />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="They owe me"
          value={money(totals.theyOwe)}
          tone="income"
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <StatCard
          label="I owe"
          value={money(totals.iOwe)}
          tone="expense"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <StatCard
          label="Net position"
          value={money(totals.net)}
          tone={totals.net >= 0 ? "brand" : "expense"}
        />
        <StatCard
          label="Overdue"
          value={money(totals.overdue)}
          tone={totals.overdue > 0 ? "warning" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
        />
      </section>

      <div className="mb-3 flex gap-2">
        <Button className="flex-1" onClick={() => openCreate("owed")}>
          <ArrowDownLeft className="h-4 w-4" /> I lent money
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => openCreate("owing")}>
          <ArrowUpRight className="h-4 w-4" /> I borrowed
        </Button>
      </div>

      <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              filter === f.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title={entries.length === 0 ? "Your khata is empty" : "Nothing in this view"}
          body={
            entries.length === 0
              ? "Record money you lend or borrow, then track partial repayments until it is settled."
              : "Try a different filter."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((e) => {
            const pct = e.amount > 0 ? (e.paid / e.amount) * 100 : 0;
            const settled = e.remaining <= 0;
            const due = e.due_date ? relativeDue(e.due_date) : null;

            return (
              <Card key={e.id} className={cn(settled && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        e.direction === "owed"
                          ? "bg-income-soft text-income"
                          : "bg-expense-soft text-expense"
                      )}
                    >
                      {e.direction === "owed" ? (
                        <ArrowDownLeft className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold text-ink">{e.person_name}</h3>
                        {settled ? (
                          <Badge tone="income">
                            <Check className="h-3 w-3" /> Settled
                          </Badge>
                        ) : e.is_overdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : e.status === "partially_paid" ? (
                          <Badge tone="warning">Part paid</Badge>
                        ) : (
                          <Badge>Pending</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {e.direction === "owed" ? "Lent" : "Borrowed"} on {formatDate(e.entry_date)}
                        {due && ` · ${due.label}`}
                      </p>
                      {e.note && <p className="mt-1 text-xs text-faint">{e.note}</p>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "tnum text-base font-bold",
                        e.direction === "owed" ? "text-income" : "text-expense"
                      )}
                    >
                      {money(e.remaining)}
                    </p>
                    <p className="text-[11px] text-faint">of {money(e.amount)}</p>
                  </div>
                </div>

                {e.paid > 0 && (
                  <div className="mt-3">
                    <Meter pct={pct} state={settled ? "ok" : "warning"} />
                    <p className="mt-1 text-[11px] text-muted">
                      {money(e.paid)} repaid ({pct.toFixed(0)}%) across {e.payments.length}{" "}
                      payment{e.payments.length === 1 ? "" : "s"}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                  {!settled && (
                    <>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setPayTarget(e);
                          setPayAmount("");
                          setPayNote("");
                          setPayError(null);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add payment
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleSettle(e)}>
                        <Check className="h-3.5 w-3.5" /> Settle in full
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmDelete(e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- Create / edit ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit khata entry" : form.direction === "owed" ? "Money I lent" : "Money I borrowed"}
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
              disabled={!form.person_name.trim() || !form.amount}
            >
              {editing ? "Save" : "Add entry"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Person" required htmlFor="k-person">
            <Input
              id="k-person"
              data-autofocus
              list="k-people"
              value={form.person_name}
              onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))}
              placeholder="Name"
            />
            <datalist id="k-people">
              {people.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>

          <Field label="Direction" htmlFor="k-dir">
            <Select
              id="k-dir"
              value={form.direction}
              onChange={(e) =>
                setForm((f) => ({ ...f, direction: e.target.value as "owed" | "owing" }))
              }
            >
              <option value="owed">They owe me (I lent)</option>
              <option value="owing">I owe them (I borrowed)</option>
            </Select>
          </Field>

          <Field label="Amount" required htmlFor="k-amount">
            <Input
              id="k-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}
              className="tnum font-semibold"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="k-date">
              <Input
                id="k-date"
                type="date"
                value={form.entry_date}
                onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
              />
            </Field>
            <Field label="Due date" htmlFor="k-due">
              <Input
                id="k-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="k-note">
            <Textarea
              id="k-note"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="What was it for?"
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* ---------- Payment ---------- */}
      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Record a payment"
        description={
          payTarget ? `${payTarget.person_name} · ${money(payTarget.remaining)} outstanding` : ""
        }
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handlePay} loading={paying} disabled={!payAmount}>
              Record
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Amount" required htmlFor="p-amount">
            <Input
              id="p-amount"
              data-autofocus
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum font-semibold"
            />
          </Field>

          {payTarget && (
            <button
              onClick={() => setPayAmount(String(payTarget.remaining))}
              className="text-xs font-medium text-[var(--brand-text)] hover:underline"
            >
              Pay the full {money(payTarget.remaining)}
            </button>
          )}

          <Field label="Note" htmlFor="p-note">
            <Input
              id="p-note"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          {payTarget && payTarget.payments.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Previous payments</p>
              <ul className="space-y-1">
                {payTarget.payments.map((p) => (
                  <li key={p.id} className="flex justify-between text-xs text-muted">
                    <span>{formatDate(p.paid_at)}</span>
                    <span className="tnum font-semibold text-ink">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {payError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {payError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete ${confirmDelete?.person_name}'s entry?`}
        body="The entry and all its recorded payments will be removed."
      />
    </div>
  );
}
