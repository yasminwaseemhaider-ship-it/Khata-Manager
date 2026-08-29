"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Trash2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImportWizard } from "@/components/import/ImportWizard";
import { Card, CardHeader, CardTitle, Field, Select } from "@/components/ui/form";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { eraseAllData, deleteAccountPermanently } from "@/app/actions/settings";
import { downloadCsv, downloadExcel, downloadPdf, transactionsToRows } from "@/lib/export";
import { monthKeyOf, totalsAllTime, yearKeyOf } from "@/lib/analytics";
import { currentMonthKey, currentYearKey, formatMonth } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import type { TransactionWithTags } from "@/types";

type Scope = "all" | "month" | "year";

export function DataTab({ transactions }: { transactions: TransactionWithTags[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, accounts, paymentMethods, vendors, tags, symbol } = useAppData();

  const [scope, setScope] = useState<Scope>("all");
  const [confirmErase, setConfirmErase] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const filtered = transactions.filter((t) => {
    if (scope === "month") return monthKeyOf(t.transaction_date) === currentMonthKey();
    if (scope === "year") return yearKeyOf(t.transaction_date) === currentYearKey();
    return true;
  });

  const scopeLabel =
    scope === "month"
      ? formatMonth(currentMonthKey())
      : scope === "year"
        ? currentYearKey()
        : "All time";

  const rows = () =>
    transactionsToRows(filtered, { categories, accounts, paymentMethods, vendors, tags });

  function guard(): boolean {
    if (filtered.length === 0) {
      toast("Nothing to export for that period.", { type: "error" });
      return false;
    }
    return true;
  }

  function exportCsv() {
    if (!guard()) return;
    downloadCsv(`khata-${scope}-${new Date().toISOString().slice(0, 10)}.csv`, rows());
    toast(`Exported ${filtered.length} transactions.`);
  }

  function exportExcel() {
    if (!guard()) return;
    downloadExcel(`khata-${scope}-${new Date().toISOString().slice(0, 10)}`, rows());
    toast("Excel file downloaded.");
  }

  function exportPdf() {
    if (!guard()) return;
    const totals = totalsAllTime(filtered);
    downloadPdf({
      title: "Khata statement",
      subtitle: scopeLabel,
      summary: [
        { label: "Income", value: formatMoney(totals.income, symbol) },
        { label: "Expenses", value: formatMoney(totals.expenses, symbol) },
        { label: "Net", value: formatMoney(totals.net, symbol) },
        { label: "Transactions", value: String(filtered.length) },
      ],
      rows: rows(),
    });
    toast("Opening print view — choose “Save as PDF”.", { type: "info" });
  }

  async function handleErase() {
    const res = await eraseAllData("DELETE");
    if (res.ok) {
      toast("All your data has been erased.", { type: "info" });
      router.refresh();
    } else toast(res.error, { type: "error" });
  }

  async function handleDeleteAccount() {
    const res = await deleteAccountPermanently("DELETE");
    // On success this redirects to /login and never returns here.
    if (res && !res.ok) toast(res.error, { type: "error" });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Export your data</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Your records are yours. Download them any time.
            </p>
          </div>
        </CardHeader>

        <Field label="What to include" htmlFor="dt-scope">
          <Select
            id="dt-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="all">Everything</option>
            <option value="month">This month ({formatMonth(currentMonthKey())})</option>
            <option value="year">This year ({currentYearKey()})</option>
          </Select>
        </Field>

        <p className="mb-3 mt-2 text-xs text-muted">
          {filtered.length} transaction{filtered.length === 1 ? "" : "s"} selected.
          For a specific date range or category, use the{" "}
          <a href="/reports" className="font-medium text-[var(--brand-text)] hover:underline">
            Reports
          </a>{" "}
          page.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import transactions</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Bring in history from a bank statement or another app.
            </p>
          </div>
        </CardHeader>

        <p className="mb-3 text-xs leading-relaxed text-muted">
          Upload a <strong className="text-ink">CSV</strong> or{" "}
          <strong className="text-ink">Excel</strong> file, match your columns to
          Khata&apos;s fields, and review a preview before anything is saved.
          Duplicate rows can be skipped automatically, so re-importing the same
          file is safe.
        </p>

        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload className="h-4 w-4" /> Import a file
        </Button>
      </Card>

      <Card className="border-[var(--danger)]/40">
        <CardHeader>
          <CardTitle className="text-danger">Danger zone</CardTitle>
        </CardHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-medium text-ink">Erase all my data</p>
            <p className="mt-0.5 text-xs text-muted">
              Deletes every transaction, category, account, budget, khata entry and
              receipt. Your login stays, so you can start fresh.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-danger"
              onClick={() => setConfirmErase(true)}
            >
              <Trash2 className="h-4 w-4" /> Erase data
            </Button>
          </div>

          <div className="rounded-xl border border-[var(--danger)]/40 bg-danger-soft p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" /> Delete my account
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Removes your data and your login permanently. This cannot be undone.
              Export anything you want to keep first.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          </div>
        </div>
      </Card>

      <ImportWizard open={showImport} onClose={() => setShowImport(false)} />

      <ConfirmDialog
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        onConfirm={handleErase}
        title="Erase all your data?"
        body="Every transaction, account, budget and receipt will be removed. Your login will remain so you can start again."
        confirmLabel="Erase everything"
        requirePhrase="DELETE"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDeleteAccount}
        title="Delete your account permanently?"
        body="This removes your data and your login. It cannot be undone."
        confirmLabel="Delete my account"
        requirePhrase="DELETE"
      />
    </div>
  );
}
