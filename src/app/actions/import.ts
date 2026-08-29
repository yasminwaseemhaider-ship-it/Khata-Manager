"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { run, ActionError, friendlyDbError } from "@/lib/server/guards";
import type { ActionResult } from "@/types";

/**
 * Bulk import of transactions from CSV / Excel.
 *
 * The client parses the file and maps columns; this action is the authority on
 * what actually gets written. It re-validates every row, resolves names to the
 * user's OWN categories/accounts/vendors (creating them only when asked), and
 * never trusts an id from the client.
 */

export interface ImportRow {
  /** Row number in the source file, for error reporting. */
  line: number;
  date?: string | null;
  type?: string | null;
  amount?: string | number | null;
  category?: string | null;
  subcategory?: string | null;
  account?: string | null;
  transferTo?: string | null;
  paymentMethod?: string | null;
  vendor?: string | null;
  description?: string | null;
  qty?: string | number | null;
  unitPrice?: string | number | null;
  tags?: string | null;
}

export interface ImportOptions {
  /** Create categories/accounts/vendors/methods that don't exist yet. */
  createMissing: boolean;
  /** Skip rows whose date+amount+note already exist, so re-imports don't duplicate. */
  skipDuplicates: boolean;
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  failed: number;
  issues: ImportIssue[];
  createdCategories: string[];
  createdAccounts: string[];
  createdVendors: string[];
}

const MAX_ROWS = 5000;
const CHUNK = 200;

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

/** Accepts dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy and ISO datetimes. */
function parseDate(input: unknown): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // yyyy-mm-dd (optionally with a time component)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (iso) {
    const d = new Date(
      Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
      Number(iso[4] ?? 12), Number(iso[5] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy or dd-mm-yyyy — day first, matching the app's en-GB display.
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const d = new Date(
      year, Number(dmy[2]) - 1, Number(dmy[1]),
      Number(dmy[4] ?? 12), Number(dmy[5] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.abs(input) : null;
  const cleaned = String(input ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function parseType(input: unknown, amount: unknown): "expense" | "income" | "transfer" {
  const t = norm(input);
  if (t.startsWith("inc") || t === "credit" || t === "in" || t === "+") return "income";
  if (t.startsWith("trans") || t === "transfer") return "transfer";
  if (t.startsWith("exp") || t === "debit" || t === "out" || t === "-") return "expense";
  // No usable type column: a negative amount means money out.
  if (typeof amount === "number" && amount > 0) return "income";
  if (typeof amount === "string" && amount.trim().startsWith("-")) return "expense";
  return "expense";
}

export async function importTransactions(
  rows: ImportRow[],
  options: ImportOptions
): Promise<ActionResult<ImportSummary>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ActionError("There are no rows to import.");
    }
    if (rows.length > MAX_ROWS) {
      throw new ActionError(
        `That file has ${rows.length} rows. Please split it into files of ${MAX_ROWS} or fewer.`
      );
    }

    // ---- Load the user's existing taxonomy once ----
    const [
      { data: cats }, { data: subs }, { data: accs },
      { data: methods }, { data: vends }, { data: tagRows }, { data: settings },
    ] = await Promise.all([
      supabase.from("categories").select("id, name, type").eq("user_id", userId),
      supabase.from("subcategories").select("id, name, category_id").eq("user_id", userId),
      supabase.from("accounts").select("id, name, is_default").eq("user_id", userId),
      supabase.from("payment_methods").select("id, name").eq("user_id", userId),
      supabase.from("vendors").select("id, name").eq("user_id", userId),
      supabase.from("tags").select("id, name").eq("user_id", userId),
      supabase.from("user_settings").select("currency_code, default_account_id")
        .eq("user_id", userId).maybeSingle(),
    ]);

    type Named = { id: string; name: string };
    const catList = (cats ?? []) as { id: string; name: string; type: string }[];
    const subList = (subs ?? []) as { id: string; name: string; category_id: string }[];
    const accList = (accs ?? []) as { id: string; name: string; is_default: boolean }[];
    const methodList = (methods ?? []) as Named[];
    const vendorList = (vends ?? []) as Named[];
    const tagList = (tagRows ?? []) as Named[];

    const catByName = new Map(catList.map((c) => [`${norm(c.name)}|${c.type}`, c.id]));
    const accByName = new Map(accList.map((a) => [norm(a.name), a.id]));
    const methodByName = new Map(methodList.map((m) => [norm(m.name), m.id]));
    const vendorByName = new Map(vendorList.map((v) => [norm(v.name), v.id]));
    const tagByName = new Map(tagList.map((t) => [norm(t.name), t.id]));
    const subByName = new Map(subList.map((s) => [`${norm(s.name)}|${s.category_id}`, s.id]));

    const currency =
      (settings as { currency_code?: string } | null)?.currency_code ?? "PKR";
    const fallbackAccount =
      (settings as { default_account_id?: string } | null)?.default_account_id ??
      accList.find((a) => a.is_default)?.id ??
      accList[0]?.id ??
      null;

    const createdCategories: string[] = [];
    const createdAccounts: string[] = [];
    const createdVendors: string[] = [];
    const issues: ImportIssue[] = [];

    // ---- Helpers that create-on-demand, always scoped to this user ----
    async function ensureCategory(name: string, type: "expense" | "income") {
      const key = `${norm(name)}|${type}`;
      const hit = catByName.get(key);
      if (hit) return hit;
      if (!options.createMissing) return null;

      const { data, error } = await supabase
        .from("categories")
        .insert({ user_id: userId, name: name.trim(), type, icon: "Tag", color: "#94a3b8" })
        .select("id")
        .single();
      if (error) return null;
      const id = (data as { id: string }).id;
      catByName.set(key, id);
      createdCategories.push(name.trim());
      return id;
    }

    async function ensureAccount(name: string) {
      const hit = accByName.get(norm(name));
      if (hit) return hit;
      if (!options.createMissing) return null;

      const { data, error } = await supabase
        .from("accounts")
        .insert({ user_id: userId, name: name.trim(), type: "cash", opening_balance: 0, currency_code: currency })
        .select("id")
        .single();
      if (error) return null;
      const id = (data as { id: string }).id;
      accByName.set(norm(name), id);
      createdAccounts.push(name.trim());
      return id;
    }

    async function ensureVendor(name: string) {
      const hit = vendorByName.get(norm(name));
      if (hit) return hit;
      if (!options.createMissing) return null;

      const { data, error } = await supabase
        .from("vendors")
        .insert({ user_id: userId, name: name.trim() })
        .select("id")
        .single();
      if (error) return null;
      const id = (data as { id: string }).id;
      vendorByName.set(norm(name), id);
      createdVendors.push(name.trim());
      return id;
    }

    async function ensureMethod(name: string) {
      const hit = methodByName.get(norm(name));
      if (hit) return hit;
      if (!options.createMissing) return null;
      const { data, error } = await supabase
        .from("payment_methods")
        .insert({ user_id: userId, name: name.trim() })
        .select("id")
        .single();
      if (error) return null;
      const id = (data as { id: string }).id;
      methodByName.set(norm(name), id);
      return id;
    }

    // ---- Existing rows, for duplicate detection ----
    const existingKeys = new Set<string>();
    if (options.skipDuplicates) {
      const { data: existing } = await supabase
        .from("transactions")
        .select("amount, transaction_date, note")
        .eq("user_id", userId)
        .limit(5000);
      for (const t of (existing ?? []) as { amount: number; transaction_date: string; note: string | null }[]) {
        existingKeys.add(
          `${new Date(t.transaction_date).toISOString().slice(0, 10)}|${Number(t.amount)}|${norm(t.note)}`
        );
      }
    }

    // ---- Build the insert payloads ----
    const payloads: Record<string, unknown>[] = [];
    const tagAssignments: { index: number; tagNames: string[] }[] = [];
    let skipped = 0;

    for (const row of rows) {
      const amount = parseAmount(row.amount);
      if (amount === null || amount <= 0) {
        issues.push({ line: row.line, message: "No valid amount." });
        continue;
      }

      const date = parseDate(row.date) ?? new Date();
      const type = parseType(row.type, row.amount);

      let categoryId: string | null = null;
      if (type !== "transfer") {
        const name = String(row.category ?? "").trim();
        if (name) {
          categoryId = await ensureCategory(name, type === "income" ? "income" : "expense");
          if (!categoryId) {
            issues.push({
              line: row.line,
              message: `Category "${name}" does not exist. Enable "create missing" or fix the row.`,
            });
            continue;
          }
        } else {
          issues.push({ line: row.line, message: "No category." });
          continue;
        }
      }

      let accountId: string | null = null;
      const accName = String(row.account ?? "").trim();
      if (accName) accountId = await ensureAccount(accName);
      if (!accountId) accountId = fallbackAccount;

      let transferToId: string | null = null;
      if (type === "transfer") {
        const toName = String(row.transferTo ?? "").trim();
        if (!toName) {
          issues.push({ line: row.line, message: "A transfer needs a destination account." });
          continue;
        }
        transferToId = await ensureAccount(toName);
        if (!transferToId || transferToId === accountId) {
          issues.push({ line: row.line, message: "Transfer accounts must exist and differ." });
          continue;
        }
      }

      const note = String(row.description ?? "").trim() || null;

      if (options.skipDuplicates) {
        const key = `${date.toISOString().slice(0, 10)}|${amount}|${norm(note)}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);
      }

      const methodName = String(row.paymentMethod ?? "").trim();
      const vendorName = String(row.vendor ?? "").trim();

      let subcategoryId: string | null = null;
      const subName = String(row.subcategory ?? "").trim();
      if (subName && categoryId) {
        subcategoryId = subByName.get(`${norm(subName)}|${categoryId}`) ?? null;
        if (!subcategoryId && options.createMissing) {
          const { data } = await supabase
            .from("subcategories")
            .insert({ user_id: userId, category_id: categoryId, name: subName })
            .select("id")
            .single();
          subcategoryId = (data as { id: string } | null)?.id ?? null;
          if (subcategoryId) subByName.set(`${norm(subName)}|${categoryId}`, subcategoryId);
        }
      }

      const qty = parseAmount(row.qty);
      const unitPrice = parseAmount(row.unitPrice);

      payloads.push({
        user_id: userId,
        type,
        amount,
        currency_code: currency,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        account_id: accountId,
        transfer_to_account_id: transferToId,
        payment_method_id: methodName ? await ensureMethod(methodName) : null,
        vendor_id: vendorName ? await ensureVendor(vendorName) : null,
        note,
        qty: qty ?? null,
        unit_price: unitPrice ?? null,
        transaction_date: date.toISOString(),
      });

      const tagNames = String(row.tags ?? "")
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tagNames.length) {
        tagAssignments.push({ index: payloads.length - 1, tagNames });
      }
    }

    if (payloads.length === 0) {
      return {
        imported: 0,
        skipped,
        failed: issues.length,
        issues: issues.slice(0, 50),
        createdCategories,
        createdAccounts,
        createdVendors,
      };
    }

    // ---- Insert in chunks so one big file cannot time out the request ----
    const insertedIds: string[] = [];
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const slice = payloads.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("transactions")
        .insert(slice)
        .select("id");

      if (error) {
        // Report which block failed rather than losing the whole import.
        issues.push({
          line: rows[i]?.line ?? i,
          message: `Rows ${i + 1}–${i + slice.length} failed: ${friendlyDbError(error.message)}`,
        });
        continue;
      }
      for (const r of (data ?? []) as { id: string }[]) insertedIds.push(r.id);
    }

    // ---- Tags ----
    if (tagAssignments.length && insertedIds.length === payloads.length) {
      const links: { user_id: string; transaction_id: string; tag_id: string }[] = [];
      for (const { index, tagNames } of tagAssignments) {
        for (const name of tagNames) {
          let tagId = tagByName.get(norm(name));
          if (!tagId && options.createMissing) {
            const { data } = await supabase
              .from("tags")
              .insert({ user_id: userId, name })
              .select("id")
              .single();
            tagId = (data as { id: string } | null)?.id;
            if (tagId) tagByName.set(norm(name), tagId);
          }
          if (tagId) {
            links.push({ user_id: userId, transaction_id: insertedIds[index], tag_id: tagId });
          }
        }
      }
      for (let i = 0; i < links.length; i += CHUNK) {
        await supabase.from("transaction_tags").insert(links.slice(i, i + CHUNK));
      }
    }

    [
      "/dashboard", "/transactions", "/daily", "/monthly", "/yearly", "/calendar",
      "/income", "/accounts", "/budgets", "/reports", "/insights", "/settings",
    ].forEach((p) => revalidatePath(p));

    return {
      imported: insertedIds.length,
      skipped,
      failed: issues.length,
      issues: issues.slice(0, 50),
      createdCategories,
      createdAccounts,
      createdVendors,
    };
  });
}
