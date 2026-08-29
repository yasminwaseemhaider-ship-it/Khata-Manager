"use client";

// ============================================================================
// Export helpers — CSV, Excel and PDF.
//
// CSV is generated with papaparse and prefixed with a UTF-8 BOM so Excel opens
// "Rs." and non-Latin names correctly. Excel export uses an HTML table with an
// .xls extension, which Excel and LibreOffice both open natively — no extra
// dependency and no binary format to get wrong. PDF uses the browser's own
// print pipeline ("Save as PDF"), which respects the user's page size and needs
// no 400 KB PDF library shipped to every visitor.
// ============================================================================

import Papa from "papaparse";
import { formatDateTime } from "./date";
import type {
  Account, Category, PaymentMethod, Tag, TransactionWithTags, Vendor,
} from "@/types";

export interface ExportLookups {
  categories: Category[];
  accounts: Account[];
  paymentMethods: PaymentMethod[];
  vendors: Vendor[];
  tags: Tag[];
}

export type Row = Record<string, string | number>;

/** Flatten transactions into human-readable rows (ids resolved to names). */
export function transactionsToRows(
  txns: TransactionWithTags[],
  lookups: ExportLookups
): Row[] {
  const cat = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const acc = new Map(lookups.accounts.map((a) => [a.id, a.name]));
  const pm = new Map(lookups.paymentMethods.map((m) => [m.id, m.name]));
  const ven = new Map(lookups.vendors.map((v) => [v.id, v.name]));
  const tag = new Map(lookups.tags.map((t) => [t.id, t.name]));

  return txns.map((t) => ({
    Date: new Date(t.transaction_date).toLocaleDateString("en-GB"),
    Time: new Date(t.transaction_date).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    Type: t.type,
    Amount: Number(t.amount),
    Currency: t.currency_code,
    Category: t.category_id ? cat.get(t.category_id) ?? "" : "",
    Account: t.account_id ? acc.get(t.account_id) ?? "" : "",
    "Transfer to": t.transfer_to_account_id ? acc.get(t.transfer_to_account_id) ?? "" : "",
    "Payment method": t.payment_method_id ? pm.get(t.payment_method_id) ?? "" : "",
    Vendor: t.vendor_id ? ven.get(t.vendor_id) ?? "" : "",
    Description: t.note ?? "",
    Quantity: t.qty ?? "",
    "Unit price": t.unit_price ?? "",
    Tags: t.tag_ids.map((id) => tag.get(id) ?? "").filter(Boolean).join(", "),
    Recurring: t.is_recurring ? "yes" : "no",
  }));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, rows: Row[]) {
  const csv = Papa.unparse(rows, { quotes: true });
  // BOM keeps Excel from mangling UTF-8.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Excel-compatible workbook (HTML table with an .xls extension). */
export function downloadExcel(filename: string, rows: Row[], sheetName = "Khata") {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
        <x:Name>${escapeHtml(sheetName)}</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        table { border-collapse: collapse; font-family: Calibri, sans-serif; }
        th { background: #059669; color: #fff; font-weight: bold; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
      </style>
    </head>
    <body>
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename.replace(/\.xlsx?$/i, "") + ".xls");
}

export interface PdfSummaryLine {
  label: string;
  value: string;
}

/**
 * Open a print-ready report the user can save as PDF.
 * Uses a hidden iframe rather than window.open so pop-up blockers don't eat it.
 */
export function downloadPdf(options: {
  title: string;
  subtitle?: string;
  summary?: PdfSummaryLine[];
  rows: Row[];
  footer?: string;
}) {
  const { title, subtitle, summary = [], rows, footer } = options;
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; min-width: 130px; }
    .stat .k { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .stat .v { font-size: 15px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead { display: table-header-group; }
    th { background: #059669; color: #fff; text-align: left; padding: 6px 8px; }
    td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
    tr { page-break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .foot { margin-top: 16px; font-size: 10px; color: #94a3b8; }
  </style></head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
    ${
      summary.length
        ? `<div class="summary">${summary
            .map(
              (s) =>
                `<div class="stat"><div class="k">${escapeHtml(s.label)}</div><div class="v">${escapeHtml(s.value)}</div></div>`
            )
            .join("")}</div>`
        : ""
    }
    ${
      rows.length
        ? `<table>
            <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${rows
              .map(
                (r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join("")}</tr>`
              )
              .join("")}</tbody>
          </table>`
        : "<p>No records in this range.</p>"
    }
    <p class="foot">${escapeHtml(footer ?? `Generated ${formatDateTime(new Date())} · Khata`)}</p>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Leave the frame long enough for the print dialog to read it.
    setTimeout(() => frame.remove(), 60_000);
  };
}
