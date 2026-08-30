"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Sparkles,
  ChevronDown,
  Check,
  X,
  Delete,
  Paperclip,
  Camera,
  Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Badge } from "@/components/ui/form";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useToast } from "@/context/ToastContext";
import { useAppData } from "@/context/AppDataContext";
import { createTransaction, deleteTransaction } from "@/app/actions/transactions";
import { uploadReceipt } from "@/app/actions/receipts";
import { parseQuickText, type ParsedTransaction } from "@/lib/parser";
import { toLocalInput } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TxType } from "@/types";

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefill for "repeat this expense" flows. */
  preset?: {
    type?: TxType;
    amount?: number;
    category_id?: string | null;
    note?: string | null;
    account_id?: string | null;
    payment_method_id?: string | null;
    vendor_id?: string | null;
  } | null;
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/** Best-guess fields returned by /api/ocr. Always confirmed before saving. */
interface OcrDraft {
  amount: number | null;
  date: string | null;
  vendor: string | null;
  lineItems: { name: string; amount: number }[];
}

/** Minimal typing for the vendor-prefixed Web Speech API. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

/**
 * Mounting only while open means every field can be initialised straight from
 * `preset`. The previous version reset ~15 pieces of state inside an effect,
 * which caused a cascading re-render on every open.
 */
export function QuickAddModal({ open, onClose, preset }: QuickAddModalProps) {
  if (!open) return null;
  return <QuickAddForm onClose={onClose} preset={preset} />;
}

function QuickAddForm({ onClose, preset }: Omit<QuickAddModalProps, "open">) {
  const router = useRouter();
  const { toast, toastWithUndo } = useToast();
  const {
    categories,
    subcategories,
    accounts,
    paymentMethods,
    vendors,
    tags,
    settings,
    frequentCategoryIds,
    symbol,
  } = useAppData();

  const [type, setType] = useState<TxType>(preset?.type ?? "expense");
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : "");
  const [categoryId, setCategoryId] = useState(preset?.category_id ?? "");
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Optional fields
  const [subcategoryId, setSubcategoryId] = useState("");
  const [accountId, setAccountId] = useState(
    preset?.account_id ?? settings.default_account_id ?? ""
  );
  const [toAccountId, setToAccountId] = useState("");
  const [methodId, setMethodId] = useState(preset?.payment_method_id ?? "");
  const [vendorId, setVendorId] = useState(preset?.vendor_id ?? "");
  const [vendorName, setVendorName] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<File | null>(null);

  // Smart entry — a Title field that also understands phrases like
  // "groceries 3500 cash at Imtiaz" and fills the amount/category for you.
  const [title, setTitle] = useState(preset?.note ?? "");
  const [draft, setDraft] = useState<ParsedTransaction | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  // Receipt scanning
  const [scanning, setScanning] = useState(false);
  const [scanDraft, setScanDraft] = useState<OcrDraft | null>(null);

  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const activeCategories = useMemo(
    () =>
      categories.filter(
        (c) => !c.is_archived && c.type === (type === "income" ? "income" : "expense")
      ),
    [categories, type]
  );

  /** Frequent categories float to the front — the fast path for repeat spends. */
  const orderedCategories = useMemo(() => {
    const freq = new Map(frequentCategoryIds.map((id, i) => [id, i]));
    return [...activeCategories].sort((a, b) => {
      const ai = freq.has(a.id) ? freq.get(a.id)! : 999;
      const bi = freq.has(b.id) ? freq.get(b.id)! : 999;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }, [activeCategories, frequentCategoryIds]);

  const availableSubs = useMemo(
    () => subcategories.filter((s) => s.category_id === categoryId && !s.is_archived),
    [subcategories, categoryId]
  );

  const numericAmount = Number(amount.replace(/,/g, ""));
  const canSave =
    title.trim().length > 0 &&
    numericAmount > 0 &&
    (type === "transfer" ? !!accountId && !!toAccountId && accountId !== toAccountId : !!categoryId);

  // Autofocus the amount: the fast path is type-a-number, tap-a-category, save.
  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Stop any in-flight speech recognition when the sheet unmounts.
  useEffect(() => {
    const rec = recognition;
    return () => rec.current?.stop();
  }, []);

  // ---- smart text ---------------------------------------------------------
  function runParse(text: string) {
    if (!text.trim()) {
      setDraft(null);
      return;
    }
    const parsed = parseQuickText(text, {
      categories: activeCategories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      paymentMethods: paymentMethods.map((m) => ({ id: m.id, name: m.name })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name })),
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    });
    setDraft(parsed);
  }

  /** Apply the parsed draft into the real form — never saves directly. */
  function acceptDraft() {
    if (!draft) return;
    if (draft.amount) setAmount(String(draft.amount));
    if (draft.type) setType(draft.type);
    if (draft.categoryId) setCategoryId(draft.categoryId);
    if (draft.paymentMethodId) setMethodId(draft.paymentMethodId);
    if (draft.accountId) setAccountId(draft.accountId);
    if (draft.vendorId) setVendorId(draft.vendorId);
    else if (draft.vendorName) setVendorName(draft.vendorName);
    if (draft.date) setWhen(toLocalInput(new Date(draft.date)));
    if (draft.note) setTitle(draft.note);
    setDraft(null);
    toast("Details filled in — check and save.", { type: "info" });
  }

  function startVoice() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Impl = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Impl) {
      toast("Voice entry isn't supported in this browser.", { type: "error" });
      return;
    }

    const rec = new Impl();
    rec.lang = "en-PK";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setTitle(text);
      runParse(text);
    };
    rec.onerror = () => {
      setListening(false);
      toast("Didn't catch that — try again.", { type: "error" });
    };
    rec.onend = () => setListening(false);

    recognition.current = rec;
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    recognition.current?.stop();
    setListening(false);
  }

  /**
   * Scan a receipt photo. The response is only ever a suggestion — it populates
   * a confirmation card, never the saved record directly.
   */
  async function scanReceipt(file: File) {
    setScanning(true);
    setScanDraft(null);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) {
        toast(json.error ?? "Could not scan that receipt.", { type: "error" });
        return;
      }
      if (!json.draft?.amount && !json.draft?.vendor) {
        toast("Nothing recognisable on that receipt — please type the amount.", {
          type: "error",
        });
        return;
      }

      // Keep the file so it is attached when the transaction is saved.
      setReceipt(file);
      setScanDraft(json.draft as OcrDraft);
    } catch {
      toast("Could not reach the scanning service.", { type: "error" });
    } finally {
      setScanning(false);
    }
  }

  /** Apply the scanned values into the form after the user accepts them. */
  function acceptScan() {
    if (!scanDraft) return;
    if (scanDraft.amount) setAmount(String(scanDraft.amount));
    if (scanDraft.vendor) {
      const hit = vendors.find(
        (v) => v.name.toLowerCase() === scanDraft.vendor!.toLowerCase()
      );
      if (hit) setVendorId(hit.id);
      else setVendorName(scanDraft.vendor);
      if (!title) setTitle(scanDraft.vendor);
    }
    if (scanDraft.date) {
      const d = new Date(`${scanDraft.date}T12:00:00`);
      if (!Number.isNaN(d.getTime())) setWhen(toLocalInput(d));
    }
    setScanDraft(null);
    setShowAdvanced(true);
    toast("Receipt details filled in — check the category and save.", { type: "info" });
  }

  // ---- keypad -------------------------------------------------------------
  function press(key: string) {
    setError(null);
    if (key === "back") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    if (key === "." && amount.includes(".")) return;
    if (key === "." && amount === "") {
      setAmount("0.");
      return;
    }
    // Cap at 2 decimal places.
    const next = amount + key;
    if (/\.\d{3,}$/.test(next)) return;
    if (next.replace(/[^0-9]/g, "").length > 12) return;
    setAmount(next);
  }

  // ---- save ---------------------------------------------------------------
  async function save(addAnother = false) {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    const res = await createTransaction({
      type,
      amount: numericAmount,
      category_id: type === "transfer" ? null : categoryId,
      subcategory_id: subcategoryId || null,
      account_id: accountId || null,
      transfer_to_account_id: type === "transfer" ? toAccountId : null,
      payment_method_id: methodId || null,
      vendor_id: vendorId || null,
      vendor_name: vendorId ? null : vendorName || null,
      note: title.trim(),
      qty: qty || null,
      unit_price: unitPrice || null,
      transaction_date: new Date(when).toISOString(),
      tag_ids: tagIds,
    });

    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }

    const newId = res.data.id;

    // Attach the receipt after the transaction exists so it gets a real folder.
    if (receipt) {
      const fd = new FormData();
      fd.set("transaction_id", newId);
      fd.set("file", receipt);
      const up = await uploadReceipt(fd);
      if (!up.ok) toast(`Saved, but the receipt failed: ${up.error}`, { type: "error" });
    }

    const label =
      type === "transfer"
        ? `Transferred ${formatMoney(numericAmount, symbol)}`
        : `${type === "income" ? "Income" : "Expense"} of ${formatMoney(numericAmount, symbol)} saved`;

    toastWithUndo(label, async () => {
      const undo = await deleteTransaction(newId);
      if (undo.ok) {
        toast("Removed.", { type: "info" });
        router.refresh();
      } else {
        toast(undo.error, { type: "error" });
      }
    });

    router.refresh();
    setSaving(false);

    if (addAnother) {
      // Keep type/category/account so logging several items in a row is fast.
      setAmount("");
      setTitle("");
      setQty("");
      setUnitPrice("");
      setReceipt(null);
      setWhen(toLocalInput(new Date()));
      amountRef.current?.focus();
    } else {
      onClose();
    }
  }

  const typeTabs: { value: TxType; label: string }[] = [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
    { value: "transfer", label: "Transfer" },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Add transaction"
      description="A short title plus the amount is all you need."
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => save(true)}
            disabled={!canSave || saving}
            className="hidden sm:inline-flex"
          >
            Save & add another
          </Button>
          <Button onClick={() => save(false)} loading={saving} disabled={!canSave} className="flex-1">
            <Check className="h-4 w-4" />
            Save {numericAmount > 0 ? formatMoney(numericAmount, symbol) : ""}
          </Button>
        </div>
      }
    >
      {/* ---------- Type ---------- */}
      <div role="tablist" aria-label="Transaction type" className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
        {typeTabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={type === t.value}
            onClick={() => {
              setType(t.value);
              setCategoryId("");
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              type === t.value
                ? t.value === "income"
                  ? "bg-surface text-income shadow-sm"
                  : t.value === "transfer"
                    ? "bg-surface text-info shadow-sm"
                    : "bg-surface text-expense shadow-sm"
                : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Title / smart entry ---------- */}
      <div className="mb-4">
        <label htmlFor="qa-title" className="mb-1.5 block text-xs font-medium text-muted">
          Title <span className="text-danger">*</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="qa-title"
              value={title}
              required
              onChange={(e) => {
                setTitle(e.target.value);
                runParse(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft) {
                  e.preventDefault();
                  acceptDraft();
                }
              }}
              placeholder="e.g. Groceries at Imtiaz"
              maxLength={120}
              className="pl-9"
              aria-label="Title (required) — what was this for?"
            />
          </div>
          <Button
            variant={listening ? "destructive" : "outline"}
            size="icon"
            onClick={listening ? stopVoice : startVoice}
            aria-label={listening ? "Stop listening" : "Speak the expense"}
            title="Voice entry"
          >
            {listening ? <MicOff className="h-5 w-5 animate-pulse-soft" /> : <Mic className="h-5 w-5" />}
          </Button>

          {type !== "transfer" && (
            <>
              <label
                htmlFor="qa-scan"
                title="Scan a receipt"
                aria-label="Scan a receipt"
                className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors hover:bg-surface-2"
              >
                {scanning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </label>
              <input
                id="qa-scan"
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="sr-only"
                disabled={scanning}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) scanReceipt(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-faint">
          Shown in your list as the title. Type an amount, e.g.{" "}
          <span className="text-muted">3500 at Imtiaz</span>, to auto-fill the rest.
        </p>

        {/* Scanned receipt — a suggestion the user must accept. */}
        {scanDraft && (
          <div className="mt-2 rounded-xl border border-[var(--brand)] bg-brand-soft p-3 animate-slide-in-bottom">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">
                  Found on the receipt
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  <li>
                    Total:{" "}
                    <strong className="text-ink">
                      {scanDraft.amount ? formatMoney(scanDraft.amount, symbol) : "not found"}
                    </strong>
                  </li>
                  {scanDraft.vendor && (
                    <li>
                      Shop: <strong className="text-ink">{scanDraft.vendor}</strong>
                    </li>
                  )}
                  {scanDraft.date && (
                    <li>
                      Date: <strong className="text-ink">{scanDraft.date}</strong>
                    </li>
                  )}
                  {scanDraft.lineItems.length > 0 && (
                    <li className="text-faint">
                      {scanDraft.lineItems.length} line items detected
                    </li>
                  )}
                </ul>
                <p className="mt-1.5 text-[11px] text-faint">
                  Check these before saving — scanning is not always exact.
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" onClick={acceptScan} disabled={!scanDraft.amount}>
                  Use this
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setScanDraft(null)}
                  aria-label="Discard scan"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation card — nothing is saved until the user accepts. */}
        {draft && (
          <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3 animate-slide-in-bottom">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">
                  {draft.amount ? formatMoney(draft.amount, symbol) : "No amount found"}
                  {draft.categoryName && ` · ${draft.categoryName}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {draft.matched.length === 0 && (
                    <span className="text-xs text-muted">Nothing recognised yet — keep typing.</span>
                  )}
                  {draft.matched.map((m) => (
                    <Badge key={m} tone="brand">
                      {m}
                    </Badge>
                  ))}
                </div>
                {draft.vendorName && (
                  <p className="mt-1.5 text-xs text-muted">Vendor: {draft.vendorName}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" onClick={acceptDraft} disabled={!draft.amount}>
                  Use this
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setDraft(null)}
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Amount ---------- */}
      <div className="mb-4">
        <label htmlFor="qa-amount" className="mb-1.5 block text-xs font-medium text-muted">
          Amount <span className="text-danger">*</span>
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <span className="text-lg font-semibold text-muted">{symbol}</span>
          <input
            id="qa-amount"
            ref={amountRef}
            data-autofocus
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if ((v.match(/\./g) ?? []).length > 1) return;
              setAmount(v);
              setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-describedby={error ? "qa-error" : undefined}
            className="tnum w-full bg-transparent text-3xl font-bold text-ink outline-none placeholder:text-faint"
          />
        </div>

        {/* On-screen keypad for one-handed mobile entry. */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:hidden">
          {KEYPAD.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              aria-label={k === "back" ? "Delete last digit" : k}
              className="flex h-12 items-center justify-center rounded-xl bg-surface-2 text-lg font-semibold text-ink active:bg-line"
            >
              {k === "back" ? <Delete className="h-5 w-5" /> : k}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Category / transfer accounts ---------- */}
      {type === "transfer" ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From account" required htmlFor="qa-from">
            <Select id="qa-from" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts
                .filter((a) => !a.is_archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label="To account"
            required
            htmlFor="qa-to"
            error={
              accountId && toAccountId && accountId === toAccountId
                ? "Pick two different accounts."
                : null
            }
          >
            <Select id="qa-to" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts
                .filter((a) => !a.is_archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="text-xs text-muted sm:col-span-2">
            Transfers move money between your own accounts. They never count as income or expense.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Category <span className="text-danger">*</span>
          </p>
          <div
            role="radiogroup"
            aria-label="Category"
            className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          >
            {orderedCategories.map((c) => {
              const active = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setCategoryId(c.id);
                    setSubcategoryId("");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors",
                    active
                      ? "border-[var(--brand)] bg-brand-soft"
                      : "border-line bg-surface hover:bg-surface-2"
                  )}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: (c.color ?? "#64748b") + "22", color: c.color ?? undefined }}
                  >
                    <CategoryIcon name={c.icon} className="h-5 w-5" />
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>

          {availableSubs.length > 0 && (
            <div className="mt-3">
              <Field label="Subcategory" htmlFor="qa-sub">
                <Select
                  id="qa-sub"
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                >
                  <option value="">None</option>
                  {availableSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      )}

      {error && (
        <p id="qa-error" role="alert" className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      {/* ---------- Advanced ---------- */}
      <button
        onClick={() => setShowAdvanced((s) => !s)}
        aria-expanded={showAdvanced}
        className="flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted hover:text-ink"
      >
        More details
        <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
      </button>

      {showAdvanced && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date & time" htmlFor="qa-when" className="sm:col-span-2">
            <Input
              id="qa-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>

          {type !== "transfer" && (
            <>
              <Field label="Account" htmlFor="qa-acc">
                <Select id="qa-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Default account</option>
                  {accounts
                    .filter((a) => !a.is_archived)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Payment method" htmlFor="qa-pm">
                <Select id="qa-pm" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                  <option value="">Not set</option>
                  {paymentMethods
                    .filter((m) => !m.is_archived)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </Select>
              </Field>

              <Field label="Vendor / shop" htmlFor="qa-vendor">
                <Input
                  id="qa-vendor"
                  list="qa-vendor-list"
                  value={vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? "" : vendorName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const hit = vendors.find(
                      (v) => v.name.toLowerCase() === val.toLowerCase()
                    );
                    setVendorId(hit?.id ?? "");
                    setVendorName(hit ? "" : val);
                  }}
                  placeholder="e.g. Imtiaz"
                />
                <datalist id="qa-vendor-list">
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name} />
                  ))}
                </datalist>
              </Field>

              <Field label="Quantity" htmlFor="qa-qty">
                <Input
                  id="qa-qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 2"
                />
              </Field>

              <Field label="Unit price" htmlFor="qa-unit">
                <Input
                  id="qa-unit"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={symbol}
                />
              </Field>

              {tags.length > 0 && (
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
                            setTagIds((ids) =>
                              on ? ids.filter((x) => x !== t.id) : [...ids, t.id]
                            )
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            on
                              ? "border-[var(--brand)] bg-brand-soft text-[var(--brand-text)]"
                              : "border-line text-muted hover:text-ink"
                          )}
                          style={on && t.color ? { borderColor: t.color } : undefined}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Field label="Receipt" htmlFor="qa-receipt" className="sm:col-span-2">
                <label
                  htmlFor="qa-receipt"
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted hover:bg-surface-2"
                >
                  {saving && receipt ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                  {receipt ? receipt.name : "Attach a photo or PDF (max 10 MB)"}
                </label>
                <input
                  id="qa-receipt"
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
