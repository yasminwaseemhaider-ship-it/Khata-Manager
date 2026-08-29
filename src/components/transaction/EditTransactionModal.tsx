"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/context/ToastContext";
import { useAppData } from "@/context/AppDataContext";
import { updateTransaction } from "@/app/actions/transactions";
import { getReceiptUrls, uploadReceipt, deleteReceipt } from "@/app/actions/receipts";
import { toLocalInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TransactionWithTags, TxType } from "@/types";

interface ReceiptView {
  id: string;
  url: string;
  name: string;
  mime: string;
}

/**
 * Full editor for an existing transaction — every optional field lives here.
 *
 * The wrapper keys the form on the transaction id so switching rows REMOUNTS
 * it. That means the form fields can be initialised straight from props, and no
 * effect is needed to copy props into state (which caused cascading renders).
 */
export function EditTransactionModal({
  tx,
  open,
  onClose,
}: {
  tx: TransactionWithTags | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!tx || !open) return null;
  return <EditForm key={tx.id} tx={tx} onClose={onClose} />;
}

function EditForm({
  tx,
  onClose,
}: {
  tx: TransactionWithTags;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, subcategories, accounts, paymentMethods, vendors, tags, symbol } =
    useAppData();

  const [type, setType] = useState<TxType>(tx.type);
  const [amount, setAmount] = useState(String(tx.amount));
  const [categoryId, setCategoryId] = useState(tx.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(tx.subcategory_id ?? "");
  const [accountId, setAccountId] = useState(tx.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(tx.transfer_to_account_id ?? "");
  const [methodId, setMethodId] = useState(tx.payment_method_id ?? "");
  const [vendorId, setVendorId] = useState(tx.vendor_id ?? "");
  const [vendorName, setVendorName] = useState("");
  const [note, setNote] = useState(tx.note ?? "");
  const [qty, setQty] = useState(tx.qty != null ? String(tx.qty) : "");
  const [unitPrice, setUnitPrice] = useState(
    tx.unit_price != null ? String(tx.unit_price) : ""
  );
  const [when, setWhen] = useState(() => toLocalInput(tx.transaction_date));
  const [tagIds, setTagIds] = useState<string[]>(tx.tag_ids ?? []);

  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receipts are fetched, not derived from props — a real effect belongs here.
  useEffect(() => {
    let cancelled = false;
    getReceiptUrls(tx.id).then((r) => {
      if (!cancelled) setReceipts(r.ok ? r.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [tx.id]);

  const catOptions = useMemo(
    () => categories.filter((c) => c.type === (type === "income" ? "income" : "expense")),
    [categories, type]
  );
  const subOptions = useMemo(
    () => subcategories.filter((s) => s.category_id === categoryId),
    [subcategories, categoryId]
  );

  async function handleSave() {
    if (!tx) return;
    setSaving(true);
    setError(null);

    const res = await updateTransaction(tx.id, {
      type,
      amount: amount,
      category_id: type === "transfer" ? null : categoryId,
      subcategory_id: subcategoryId || null,
      account_id: accountId || null,
      transfer_to_account_id: type === "transfer" ? toAccountId : null,
      payment_method_id: methodId || null,
      vendor_id: vendorId || null,
      vendor_name: vendorId ? null : vendorName || null,
      note: note || null,
      qty: qty || null,
      unit_price: unitPrice || null,
      transaction_date: new Date(when).toISOString(),
      tag_ids: tagIds,
    });

    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Changes saved.");
    router.refresh();
    onClose();
  }

  async function handleUpload(file: File) {
    if (!tx) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("transaction_id", tx.id);
    fd.set("file", file);
    const res = await uploadReceipt(fd);
    setUploading(false);

    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    const refreshed = await getReceiptUrls(tx.id);
    if (refreshed.ok) setReceipts(refreshed.data);
    toast("Receipt attached.");
    router.refresh();
  }

  async function handleRemoveReceipt(id: string) {
    const res = await deleteReceipt(id);
    if (!res.ok) {
      toast(res.error, { type: "error" });
      return;
    }
    setReceipts((r) => r.filter((x) => x.id !== id));
    toast("Receipt removed.", { type: "info" });
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit transaction"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} loading={saving}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="ed-type">
          <Select
            id="ed-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TxType);
              setCategoryId("");
              setSubcategoryId("");
            }}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </Select>
        </Field>

        <Field label="Amount" required htmlFor="ed-amount">
          <Input
            id="ed-amount"
            data-autofocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={symbol}
            className="tnum font-semibold"
          />
        </Field>

        {type === "transfer" ? (
          <>
            <Field label="From account" required htmlFor="ed-from">
              <Select id="ed-from" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="To account" required htmlFor="ed-to">
              <Select id="ed-to" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Category" required htmlFor="ed-cat">
              <Select
                id="ed-cat"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId("");
                }}
              >
                <option value="">Choose…</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_archived ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Subcategory" htmlFor="ed-sub">
              <Select
                id="ed-sub"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                disabled={subOptions.length === 0}
              >
                <option value="">None</option>
                {subOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Account" htmlFor="ed-acc">
              <Select id="ed-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Not set</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Payment method" htmlFor="ed-pm">
              <Select id="ed-pm" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                <option value="">Not set</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Vendor / shop" htmlFor="ed-vendor">
              <Input
                id="ed-vendor"
                list="ed-vendor-list"
                value={vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? "" : vendorName}
                onChange={(e) => {
                  const val = e.target.value;
                  const hit = vendors.find((v) => v.name.toLowerCase() === val.toLowerCase());
                  setVendorId(hit?.id ?? "");
                  setVendorName(hit ? "" : val);
                }}
              />
              <datalist id="ed-vendor-list">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </Field>

            <Field label="Quantity" htmlFor="ed-qty">
              <Input
                id="ed-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </Field>

            <Field label="Unit price" htmlFor="ed-unit">
              <Input
                id="ed-unit"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </Field>
          </>
        )}

        <Field label="Date & time" htmlFor="ed-when" className="sm:col-span-2">
          <Input
            id="ed-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor="ed-note" className="sm:col-span-2">
          <Textarea
            id="ed-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {tags.length > 0 && type !== "transfer" && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-muted">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    aria-pressed={on}
                    onClick={() =>
                      setTagIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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

        {/* ---------- Receipts ---------- */}
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-medium text-muted">Receipts</p>

          {receipts.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.name}</span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-muted hover:text-ink"
                    aria-label={`Open ${r.name}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => handleRemoveReceipt(r.id)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label={`Remove ${r.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label
            htmlFor="ed-receipt"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted hover:bg-surface-2"
          >
            <Paperclip className="h-4 w-4" />
            {uploading ? "Uploading…" : "Attach a receipt (JPG, PNG, PDF — max 10 MB)"}
          </label>
          <input
            id="ed-receipt"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
