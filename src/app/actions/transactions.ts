"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { assertOwned, requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { transactionSchema, type TransactionInput } from "@/lib/validation";
import type { ActionResult, Transaction } from "@/types";

/**
 * Every page that shows money is derived from the transactions table, so a
 * write invalidates all of them at once. Balances, budgets, reports and the
 * dashboard therefore never show a stale or fabricated number.
 */
const MONEY_PATHS = [
  "/dashboard",
  "/transactions",
  "/daily",
  "/monthly",
  "/yearly",
  "/calendar",
  "/income",
  "/accounts",
  "/budgets",
  "/reports",
  "/insights",
];

function revalidateMoney() {
  for (const p of MONEY_PATHS) revalidatePath(p);
}

/** Resolve a free-typed vendor name to an id, creating the vendor if new. */
async function resolveVendor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  vendorId: string | null,
  vendorName: string | null
): Promise<string | null> {
  if (vendorId) return vendorId;
  if (!vendorName) return null;

  const { data: existing } = await supabase
    .from("vendors")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", vendorName)
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from("vendors")
    .insert({ user_id: userId, name: vendorName })
    .select("id")
    .single();
  if (error) return null;
  return (created as { id: string }).id;
}

/** Replace a transaction's tag set (tags are validated as owned first). */
async function syncTags(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  transactionId: string,
  tagIds: string[] | undefined
) {
  if (!tagIds) return;
  await assertOwned(supabase, userId, "tags", tagIds);
  await supabase
    .from("transaction_tags")
    .delete()
    .eq("user_id", userId)
    .eq("transaction_id", transactionId);
  if (tagIds.length) {
    await supabase.from("transaction_tags").insert(
      tagIds.map((tag_id) => ({ user_id: userId, transaction_id: transactionId, tag_id }))
    );
  }
}

/**
 * Create a transaction. Only `amount` + `category` (or two accounts, for a
 * transfer) are required — date, account, currency and payment method fall back
 * to sensible per-user defaults so the fast path stays two taps.
 */
export async function createTransaction(
  input: TransactionInput
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = transactionSchema.parse(input);

    await Promise.all([
      assertOwned(supabase, userId, "categories", [v.category_id]),
      assertOwned(supabase, userId, "subcategories", [v.subcategory_id]),
      assertOwned(supabase, userId, "accounts", [v.account_id, v.transfer_to_account_id]),
      assertOwned(supabase, userId, "payment_methods", [v.payment_method_id]),
      assertOwned(supabase, userId, "vendors", [v.vendor_id]),
    ]);

    // Smart defaults: last-used account, then the user's default, then any.
    let accountId = v.account_id;
    if (!accountId) {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("default_account_id, currency_code")
        .eq("user_id", userId)
        .maybeSingle();
      accountId = (settings as { default_account_id?: string } | null)?.default_account_id ?? null;
    }
    if (!accountId) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      accountId = (acc as { id: string } | null)?.id ?? null;
    }

    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("currency_code")
      .eq("user_id", userId)
      .maybeSingle();

    const vendorId = await resolveVendor(supabase, userId, v.vendor_id, v.vendor_name);

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: v.type,
        amount: v.amount,
        currency_code:
          (settingsRow as { currency_code?: string } | null)?.currency_code ?? "PKR",
        category_id: v.type === "transfer" ? null : v.category_id,
        subcategory_id: v.type === "transfer" ? null : v.subcategory_id,
        account_id: accountId,
        transfer_to_account_id:
          v.type === "transfer" ? v.transfer_to_account_id : null,
        payment_method_id: v.payment_method_id,
        vendor_id: vendorId,
        note: v.note,
        qty: v.qty,
        unit_price: v.unit_price,
        transaction_date: v.transaction_date ?? new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw new ActionError(friendlyDbError(error.message));

    const id = (data as { id: string }).id;
    await syncTags(supabase, userId, id, v.tag_ids);
    revalidateMoney();
    return { id };
  });
}

export async function updateTransaction(
  id: string,
  input: TransactionInput
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "transactions", id, "id");
    const v = transactionSchema.parse(input);

    await Promise.all([
      assertOwned(supabase, userId, "categories", [v.category_id]),
      assertOwned(supabase, userId, "subcategories", [v.subcategory_id]),
      assertOwned(supabase, userId, "accounts", [v.account_id, v.transfer_to_account_id]),
      assertOwned(supabase, userId, "payment_methods", [v.payment_method_id]),
      assertOwned(supabase, userId, "vendors", [v.vendor_id]),
    ]);

    const vendorId = await resolveVendor(supabase, userId, v.vendor_id, v.vendor_name);

    const { error } = await supabase
      .from("transactions")
      .update({
        type: v.type,
        amount: v.amount,
        category_id: v.type === "transfer" ? null : v.category_id,
        subcategory_id: v.type === "transfer" ? null : v.subcategory_id,
        account_id: v.account_id,
        transfer_to_account_id:
          v.type === "transfer" ? v.transfer_to_account_id : null,
        payment_method_id: v.payment_method_id,
        vendor_id: vendorId,
        note: v.note,
        qty: v.qty,
        unit_price: v.unit_price,
        ...(v.transaction_date ? { transaction_date: v.transaction_date } : {}),
      })
      .eq("id", id)
      .eq("user_id", userId); // belt-and-braces alongside RLS

    if (error) throw new ActionError(friendlyDbError(error.message));

    await syncTags(supabase, userId, id, v.tag_ids);
    revalidateMoney();
    return { id };
  });
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateMoney();
    return undefined as never;
  });
}

export async function deleteTransactions(ids: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    if (!ids.length) return undefined as never;
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateMoney();
    return undefined as never;
  });
}

/**
 * Copy an existing transaction. `mode: "repeat"` stamps it with today's
 * date/time (log the same expense again); `mode: "duplicate"` keeps the
 * original date (fix a miskeyed entry by copying then editing).
 */
export async function duplicateTransaction(
  id: string,
  mode: "duplicate" | "repeat" = "repeat"
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const src = await requireOwnedRow<Transaction>(
      supabase,
      userId,
      "transactions",
      id
    );

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: src.type,
        amount: src.amount,
        currency_code: src.currency_code,
        category_id: src.category_id,
        subcategory_id: src.subcategory_id,
        account_id: src.account_id,
        transfer_to_account_id: src.transfer_to_account_id,
        payment_method_id: src.payment_method_id,
        vendor_id: src.vendor_id,
        note: src.note || "Transaction",
        qty: src.qty,
        unit_price: src.unit_price,
        transaction_date:
          mode === "repeat" ? new Date().toISOString() : src.transaction_date,
      })
      .select("id")
      .single();

    if (error) throw new ActionError(friendlyDbError(error.message));
    const newId = (data as { id: string }).id;

    // Carry the tags across too.
    const { data: tags } = await supabase
      .from("transaction_tags")
      .select("tag_id")
      .eq("user_id", userId)
      .eq("transaction_id", id);
    const tagIds = (tags ?? []).map((t: { tag_id: string }) => t.tag_id);
    if (tagIds.length) await syncTags(supabase, userId, newId, tagIds);

    revalidateMoney();
    return { id: newId };
  });
}

/** Run any recurring rules that have come due. Cheap and idempotent per day. */
export async function postDueRecurring(): Promise<ActionResult<{ posted: number }>> {
  return run(async () => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("post_due_recurring");
    if (error) throw new ActionError(friendlyDbError(error.message));
    const posted = (data as number) ?? 0;
    if (posted > 0) revalidateMoney();
    return { posted };
  });
}
