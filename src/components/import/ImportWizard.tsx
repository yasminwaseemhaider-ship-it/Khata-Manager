"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  FileUp, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Table2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, Badge } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { importTransactions, type ImportRow, type ImportSummary } from "@/app/actions/import";
import { cn } from "@/lib/utils";

/** The fields we can populate, and the header names we auto-detect for each. */
const FIELDS = [
  { key: "date", label: "Date", required: true, aliases: ["date", "transaction date", "tarikh", "day", "when"] },
  { key: "amount", label: "Amount", required: true, aliases: ["amount", "value", "total", "price", "raqam", "debit", "credit"] },
  { key: "type", label: "Type", required: false, aliases: ["type", "kind", "direction", "expense/income", "dr/cr"] },
  { key: "category", label: "Category", required: false, aliases: ["category", "cat", "head", "group"] },
  { key: "subcategory", label: "Subcategory", required: false, aliases: ["subcategory", "sub category", "sub"] },
  { key: "account", label: "Account", required: false, aliases: ["account", "acc", "wallet", "bank", "paid from"] },
  { key: "transferTo", label: "Transfer to", required: false, aliases: ["transfer to", "to account", "destination"] },
  { key: "paymentMethod", label: "Payment method", required: false, aliases: ["payment method", "payment", "method", "mode"] },
  { key: "vendor", label: "Vendor / shop", required: false, aliases: ["vendor", "shop", "merchant", "store", "payee"] },
  { key: "description", label: "Description", required: false, aliases: ["description", "note", "notes", "details", "particulars", "narration", "memo"] },
  { key: "qty", label: "Quantity", required: false, aliases: ["quantity", "qty"] },
  { key: "unitPrice", label: "Unit price", required: false, aliases: ["unit price", "rate", "per unit"] },
  { key: "tags", label: "Tags", required: false, aliases: ["tags", "labels"] },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Mapping = Partial<Record<FieldKey, string>>;

const MAX_ROWS = 5000;

function autoMap(headers: string[]): Mapping {
  const map: Mapping = {};
  const used = new Set<string>();
  for (const field of FIELDS) {
    const hit = headers.find((h) => {
      if (used.has(h)) return false;
      const n = h.trim().toLowerCase();
      return field.aliases.some((a) => n === a) || field.aliases.some((a) => n.includes(a));
    });
    if (hit) {
      map[field.key] = hit;
      used.add(hit);
    }
  }
  return map;
}

export function ImportWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const { money } = useAppData();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(0);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setError(null);
    setSummary(null);
    setParsing(false);
    setImporting(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);

    try {
      const name = file.name.toLowerCase();
      let parsedHeaders: string[] = [];
      let parsedRows: Record<string, unknown>[] = [];

      if (name.endsWith(".csv") || name.endsWith(".txt")) {
        const text = await file.text();
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h) => h.trim(),
        });
        parsedHeaders = (result.meta.fields ?? []).filter(Boolean);
        parsedRows = result.data;
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        // exceljs is ~1 MB, so it only loads when someone actually imports Excel.
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) throw new Error("That workbook has no sheets.");

        const matrix: unknown[][] = [];
        ws.eachRow((row) => {
          const values = row.values as unknown[];
          matrix.push(values.slice(1)); // exceljs pads index 0
        });
        if (matrix.length === 0) throw new Error("That sheet is empty.");

        parsedHeaders = (matrix[0] ?? []).map((h, i) => String(h ?? `Column ${i + 1}`).trim());
        parsedRows = matrix.slice(1).map((r) => {
          const obj: Record<string, unknown> = {};
          parsedHeaders.forEach((h, i) => {
            const cell = r[i];
            // exceljs returns rich objects for formulas/dates.
            if (cell && typeof cell === "object") {
              const o = cell as { result?: unknown; text?: unknown };
              obj[h] = o.result ?? o.text ?? (cell instanceof Date ? cell : String(cell));
            } else {
              obj[h] = cell;
            }
          });
          return obj;
        });
      } else {
        throw new Error("Choose a .csv, .xlsx or .xls file.");
      }

      parsedRows = parsedRows.filter((r) =>
        Object.values(r).some((v) => String(v ?? "").trim() !== "")
      );

      if (parsedHeaders.length === 0) throw new Error("No column headings found in that file.");
      if (parsedRows.length === 0) throw new Error("That file has headings but no data rows.");
      if (parsedRows.length > MAX_ROWS) {
        throw new Error(
          `That file has ${parsedRows.length} rows. The limit is ${MAX_ROWS} — please split it.`
        );
      }

      setFileName(file.name);
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      setMapping(autoMap(parsedHeaders));
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setParsing(false);
    }
  }

  /** Map the raw rows through the chosen columns. */
  const mapped: ImportRow[] = useMemo(
    () =>
      rows.map((r, i) => {
        const pick = (k: FieldKey) => {
          const col = mapping[k];
          return col ? (r[col] as string | number | null | undefined) ?? null : null;
        };
        return {
          line: i + 2, // +2: 1-indexed, plus the header row
          date: pick("date") as string | null,
          amount: pick("amount") as string | number | null,
          type: pick("type") as string | null,
          category: pick("category") as string | null,
          subcategory: pick("subcategory") as string | null,
          account: pick("account") as string | null,
          transferTo: pick("transferTo") as string | null,
          paymentMethod: pick("paymentMethod") as string | null,
          vendor: pick("vendor") as string | null,
          description: pick("description") as string | null,
          qty: pick("qty") as string | number | null,
          unitPrice: pick("unitPrice") as string | number | null,
          tags: pick("tags") as string | null,
        };
      }),
    [rows, mapping]
  );

  /** Client-side preflight so problems are visible before anything is written. */
  const preflight = useMemo(() => {
    let valid = 0;
    const problems: { line: number; message: string }[] = [];
    for (const row of mapped) {
      const amountRaw = String(row.amount ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
      const amount = Number(amountRaw);
      if (!amountRaw || !Number.isFinite(amount) || amount === 0) {
        problems.push({ line: row.line, message: "Missing or invalid amount" });
        continue;
      }
      const typeStr = String(row.type ?? "").toLowerCase();
      const isTransfer = typeStr.startsWith("trans");
      if (!isTransfer && !String(row.category ?? "").trim()) {
        problems.push({ line: row.line, message: "No category" });
        continue;
      }
      valid++;
    }
    return { valid, problems };
  }, [mapped]);

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  async function runImport() {
    setImporting(true);
    setError(null);
    const res = await importTransactions(mapped, { createMissing, skipDuplicates });
    setImporting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSummary(res.data);
    setStep(3);
    if (res.data.imported > 0) {
      toast(`Imported ${res.data.imported} transactions.`);
      router.refresh();
    }
  }

  const stepTitles = ["Choose a file", "Match your columns", "Check and import", "Done"];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import transactions"
      description={stepTitles[step]}
      size="xl"
      footer={
        step === 3 ? (
          <Button className="w-full" onClick={close}>
            Close
          </Button>
        ) : (
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={close}>
              Cancel
            </Button>
            {step === 1 && (
              <Button
                className="flex-1"
                onClick={() => setStep(2)}
                disabled={missingRequired.length > 0}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button
                className="flex-1"
                onClick={runImport}
                loading={importing}
                disabled={preflight.valid === 0}
              >
                Import {preflight.valid} row{preflight.valid === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        )
      }
    >
      {/* ---------- Step 0: file ---------- */}
      {step === 0 && (
        <div>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-6 py-12 text-center transition-colors hover:border-[var(--brand)] hover:bg-surface-2"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-[var(--brand-text)]">
              {parsing ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FileUp className="h-7 w-7" />
              )}
            </span>
            <span className="text-sm font-semibold text-ink">
              {parsing ? "Reading your file…" : "Choose a CSV or Excel file"}
            </span>
            <span className="text-xs text-muted">
              .csv, .xlsx or .xls · up to {MAX_ROWS.toLocaleString()} rows
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          <div className="mt-4 rounded-xl bg-surface-2 p-3">
            <p className="mb-1.5 text-xs font-semibold text-ink">What your file needs</p>
            <p className="text-xs leading-relaxed text-muted">
              A heading row, then one transaction per row. Only{" "}
              <strong className="text-ink">date</strong> and{" "}
              <strong className="text-ink">amount</strong> are required — you&apos;ll match
              your own column names in the next step. Dates can be{" "}
              <code className="text-ink">dd/mm/yyyy</code> or{" "}
              <code className="text-ink">yyyy-mm-dd</code>.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ---------- Step 1: mapping ---------- */}
      {step === 1 && (
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <Table2 className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{fileName}</span>
            <Badge tone="brand">{rows.length} rows</Badge>
          </div>

          <p className="mb-3 text-xs text-muted">
            We matched your columns automatically. Change anything that looks wrong.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                htmlFor={`map-${f.key}`}
                error={f.required && !mapping[f.key] ? "Pick a column for this." : null}
              >
                <Select
                  id={`map-${f.key}`}
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
                  }
                >
                  <option value="">— not in my file —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          {!mapping.type && (
            <p className="mt-3 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
              No type column mapped — every row will be imported as an{" "}
              <strong>expense</strong> unless its amount is negative.
            </p>
          )}
        </div>
      )}

      {/* ---------- Step 2: preview ---------- */}
      {step === 2 && (
        <div>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-muted">Ready to import</p>
              <p className="tnum text-xl font-bold text-income">{preflight.valid}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-muted">Will be skipped</p>
              <p className="tnum text-xl font-bold text-warning">{preflight.problems.length}</p>
            </div>
          </div>

          <div className="mb-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  Create categories, accounts and vendors that don&apos;t exist yet
                </span>
                <span className="block text-xs text-muted">
                  Off means rows naming something unknown are skipped instead.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Skip likely duplicates</span>
                <span className="block text-xs text-muted">
                  Ignores rows matching an existing date, amount and description — so
                  importing the same file twice is safe.
                </span>
              </span>
            </label>
          </div>

          <p className="mb-2 text-xs font-semibold text-ink">First rows, as they will be saved</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-surface-2">
                <tr className="text-left text-muted">
                  <th className="px-2 py-2 font-medium">Row</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {mapped.slice(0, 8).map((r) => {
                  const bad = preflight.problems.find((p) => p.line === r.line);
                  return (
                    <tr key={r.line} className={cn(bad && "bg-danger-soft")}>
                      <td className="px-2 py-1.5 text-faint">{r.line}</td>
                      <td className="px-2 py-1.5 text-ink">{String(r.date ?? "—")}</td>
                      <td className="px-2 py-1.5 text-ink">{String(r.type ?? "expense")}</td>
                      <td className="tnum px-2 py-1.5 text-right text-ink">
                        {String(r.amount ?? "—")}
                      </td>
                      <td className="px-2 py-1.5 text-ink">{String(r.category ?? "—")}</td>
                      <td className="max-w-[160px] truncate px-2 py-1.5 text-muted">
                        {String(r.description ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preflight.problems.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--warning)]/40 bg-warning-soft p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {preflight.problems.length} row
                {preflight.problems.length === 1 ? "" : "s"} will be skipped
              </p>
              <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted">
                {preflight.problems.slice(0, 12).map((p) => (
                  <li key={p.line}>
                    Row {p.line}: {p.message}
                  </li>
                ))}
                {preflight.problems.length > 12 && (
                  <li>…and {preflight.problems.length - 12} more</li>
                )}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ---------- Step 3: result ---------- */}
      {step === 3 && summary && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-[var(--brand-text)]">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-ink">
            Imported {summary.imported} transaction{summary.imported === 1 ? "" : "s"}
          </h3>

          <div className="mt-4 grid grid-cols-3 gap-2 text-left">
            <div className="rounded-xl border border-line p-2.5">
              <p className="text-[11px] text-muted">Imported</p>
              <p className="tnum text-lg font-bold text-income">{summary.imported}</p>
            </div>
            <div className="rounded-xl border border-line p-2.5">
              <p className="text-[11px] text-muted">Skipped</p>
              <p className="tnum text-lg font-bold text-warning">{summary.skipped}</p>
            </div>
            <div className="rounded-xl border border-line p-2.5">
              <p className="text-[11px] text-muted">Failed</p>
              <p className="tnum text-lg font-bold text-danger">{summary.failed}</p>
            </div>
          </div>

          {(summary.createdCategories.length > 0 ||
            summary.createdAccounts.length > 0 ||
            summary.createdVendors.length > 0) && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-left">
              <p className="mb-1 text-xs font-semibold text-ink">Also created for you</p>
              {summary.createdCategories.length > 0 && (
                <p className="text-xs text-muted">
                  Categories: {summary.createdCategories.join(", ")}
                </p>
              )}
              {summary.createdAccounts.length > 0 && (
                <p className="text-xs text-muted">
                  Accounts: {summary.createdAccounts.join(", ")}
                </p>
              )}
              {summary.createdVendors.length > 0 && (
                <p className="text-xs text-muted">
                  Vendors: {summary.createdVendors.slice(0, 10).join(", ")}
                  {summary.createdVendors.length > 10 &&
                    ` +${summary.createdVendors.length - 10} more`}
                </p>
              )}
            </div>
          )}

          {summary.issues.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--warning)]/40 bg-warning-soft p-3 text-left">
              <p className="text-xs font-semibold text-warning">Rows that could not be imported</p>
              <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted">
                {summary.issues.map((i, idx) => (
                  <li key={idx}>
                    Row {i.line}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
