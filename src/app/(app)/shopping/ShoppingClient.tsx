"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Plus, Check, Trash2, Receipt, Eraser, } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card, Field, Input, Select, Badge, StatCard, SectionTitle } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  createShoppingItem, toggleShoppingItem, deleteShoppingItem,
  convertItemToExpense, clearPurchased,
} from "@/app/actions/shopping";
import { cn } from "@/lib/utils";
import type { Priority, ShoppingItem, ShoppingList } from "@/types";

const PRIORITY_TONE: Record<Priority, "danger" | "neutral" | "info"> = {
  high: "danger",
  normal: "neutral",
  low: "info",
};

const EMPTY = {
  name: "",
  qty: "",
  unit: "",
  est_price: "",
  category_id: "",
  priority: "normal" as Priority,
};

export function ShoppingClient({
  lists,
  items,
}: {
  lists: ShoppingList[];
  items: ShoppingItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, accounts, paymentMethods, money } = useAppData();

  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [convertTarget, setConvertTarget] = useState<ShoppingItem | null>(null);
  const [convertAmount, setConvertAmount] = useState("");
  const [convertAccount, setConvertAccount] = useState("");
  const [convertMethod, setConvertMethod] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const pending = items.filter((i) => !i.purchased);
  const purchased = items.filter((i) => i.purchased);

  const estimate = useMemo(
    () =>
      pending.reduce(
        (s, i) => s + Number(i.est_price ?? 0) * (i.qty != null ? Number(i.qty) : 1),
        0
      ),
    [pending]
  );

  const expenseCategories = categories.filter((c) => c.type === "expense" && !c.is_archived);

  async function handleAdd() {
    setSaving(true);
    setError(null);
    const res = await createShoppingItem({
      name: form.name,
      qty: form.qty || null,
      unit: form.unit || null,
      est_price: form.est_price || null,
      category_id: form.category_id || null,
      priority: form.priority,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Added to the list.");
    setForm(EMPTY);
    setShowForm(false);
    router.refresh();
  }

  async function handleToggle(item: ShoppingItem) {
    setBusy(item.id);
    const res = await toggleShoppingItem(item.id, !item.purchased);
    setBusy(null);
    if (res.ok) router.refresh();
    else toast(res.error, { type: "error" });
  }

  async function handleDelete(item: ShoppingItem) {
    setBusy(item.id);
    const res = await deleteShoppingItem(item.id);
    setBusy(null);
    if (res.ok) {
      toast("Removed.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  function openConvert(item: ShoppingItem) {
    setConvertTarget(item);
    const guess = Number(item.est_price ?? 0) * (item.qty != null ? Number(item.qty) : 1);
    setConvertAmount(guess > 0 ? String(guess) : "");
    setConvertAccount("");
    setConvertMethod("");
    setConvertError(null);
  }

  async function handleConvert() {
    if (!convertTarget) return;
    setConverting(true);
    setConvertError(null);
    const res = await convertItemToExpense(convertTarget.id, {
      amount: convertAmount ? Number(convertAmount) : undefined,
      account_id: convertAccount || null,
      payment_method_id: convertMethod || null,
    });
    setConverting(false);
    if (!res.ok) {
      setConvertError(res.error);
      return;
    }
    toast(`"${convertTarget.name}" recorded as an expense.`);
    setConvertTarget(null);
    router.refresh();
  }

  async function handleClearPurchased() {
    const res = await clearPurchased(null);
    if (res.ok) {
      toast(`${res.data.removed} item${res.data.removed === 1 ? "" : "s"} cleared.`, {
        type: "info",
      });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  function renderItem(item: ShoppingItem) {
    const cat = categories.find((c) => c.id === item.category_id);
    const lineTotal =
      Number(item.est_price ?? 0) * (item.qty != null ? Number(item.qty) : 1);

    return (
      <div
        key={item.id}
        className={cn(
          "flex items-center gap-3 px-2 py-2.5",
          busy === item.id && "opacity-50"
        )}
      >
        <button
          onClick={() => handleToggle(item)}
          aria-label={item.purchased ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`}
          aria-pressed={item.purchased}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            item.purchased
              ? "border-[var(--brand)] bg-[var(--brand)] text-white"
              : "border-line hover:border-[var(--brand)]"
          )}
        >
          {item.purchased && <Check className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                item.purchased ? "text-faint line-through" : "text-ink"
              )}
            >
              {item.name}
            </span>
            {item.priority !== "normal" && (
              <Badge tone={PRIORITY_TONE[item.priority]}>{item.priority}</Badge>
            )}
            {item.transaction_id && <Badge tone="income">Expensed</Badge>}
          </div>
          <p className="truncate text-xs text-muted">
            {[
              item.qty ? `${item.qty}${item.unit ? ` ${item.unit}` : ""}` : null,
              cat?.name,
              lineTotal > 0 ? `≈ ${money(lineTotal)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {cat && (
          <span
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex"
            style={{ backgroundColor: (cat.color ?? "#64748b") + "22", color: cat.color ?? undefined }}
          >
            <CategoryIcon name={cat.icon} className="h-4 w-4" />
          </span>
        )}

        <div className="flex shrink-0 gap-0.5">
          {item.purchased && !item.transaction_id && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => openConvert(item)}
              aria-label={`Record ${item.name} as an expense`}
              title="Convert to expense"
            >
              <Receipt className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-danger"
            onClick={() => handleDelete(item)}
            aria-label={`Delete ${item.name}`}
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
        title="Shopping list"
        sub="Plan the trip, then turn what you bought into expenses"
        action={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add item</span>
          </Button>
        }
      />

      <section className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="To buy" value={String(pending.length)} tone="neutral" />
        <StatCard label="Bought" value={String(purchased.length)} tone="brand" />
        <StatCard label="Estimated cost" value={money(estimate)} tone="warning" />
      </section>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Your list is empty"
          body="Add what you need before the next trip. Tick things off as you buy them, then convert them into expenses in one tap."
          actionLabel="Add the first item"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card className="p-2">
              <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                To buy · {pending.length}
              </h2>
              <div className="divide-y divide-[var(--border)]">{pending.map(renderItem)}</div>
            </Card>
          )}

          {purchased.length > 0 && (
            <Card className="p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Bought · {purchased.length}
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                  <Eraser className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
              <div className="divide-y divide-[var(--border)]">{purchased.map(renderItem)}</div>
            </Card>
          )}
        </div>
      )}

      {/* ---------- Add item ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add item"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAdd}
              loading={saving}
              disabled={!form.name.trim()}
            >
              Add
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Item" required htmlFor="s-name">
            <Input
              id="s-name"
              data-autofocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Atta 10kg"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" htmlFor="s-qty">
              <Input
                id="s-qty"
                inputMode="decimal"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/[^0-9.]/g, "") }))}
              />
            </Field>
            <Field label="Unit" htmlFor="s-unit">
              <Input
                id="s-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="kg, packet…"
              />
            </Field>
          </div>

          <Field label="Estimated price (each)" htmlFor="s-price">
            <Input
              id="s-price"
              inputMode="decimal"
              value={form.est_price}
              onChange={(e) =>
                setForm((f) => ({ ...f, est_price: e.target.value.replace(/[^0-9.]/g, "") }))
              }
            />
          </Field>

          <Field label="Category" htmlFor="s-cat">
            <Select
              id="s-cat"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Not set</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Priority" htmlFor="s-pri">
            <Select
              id="s-pri"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* ---------- Convert to expense ---------- */}
      <Modal
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        title="Record as an expense"
        description={convertTarget?.name}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConvertTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleConvert}
              loading={converting}
              disabled={!convertAmount}
            >
              Save expense
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field
            label="Amount actually paid"
            required
            htmlFor="c-amount"
            hint="Pre-filled from your estimate — change it to what you really paid."
          >
            <Input
              id="c-amount"
              data-autofocus
              inputMode="decimal"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum font-semibold"
            />
          </Field>

          <Field label="Account" htmlFor="c-acc">
            <Select
              id="c-acc"
              value={convertAccount}
              onChange={(e) => setConvertAccount(e.target.value)}
            >
              <option value="">Default account</option>
              {accounts.filter((a) => !a.is_archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Payment method" htmlFor="c-pm">
            <Select id="c-pm" value={convertMethod} onChange={(e) => setConvertMethod(e.target.value)}>
              <option value="">Not set</option>
              {paymentMethods.filter((m) => !m.is_archived).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>

          {convertError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {convertError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClearPurchased}
        title="Clear bought items?"
        body="They will be removed from the list. Any expenses you already created from them are kept."
        confirmLabel="Clear"
      />
    </div>
  );
}
