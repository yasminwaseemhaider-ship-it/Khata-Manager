"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { assertOwned, requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { shoppingItemSchema } from "@/lib/validation";
import type { ActionResult, ShoppingItem } from "@/types";

function revalidateShopping() {
  ["/shopping", "/dashboard", "/transactions"].forEach((p) => revalidatePath(p));
}

export async function createShoppingList(name: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const clean = name.trim() || "Shopping list";
    const { data, error } = await supabase
      .from("shopping_lists")
      .insert({ user_id: userId, name: clean })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return { id: (data as { id: string }).id };
  });
}

export async function deleteShoppingList(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("shopping_lists")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return undefined as never;
  });
}

export async function createShoppingItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = shoppingItemSchema.parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);
    await assertOwned(supabase, userId, "shopping_lists", [v.list_id]);

    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        user_id: userId,
        list_id: v.list_id,
        name: v.name,
        category_id: v.category_id,
        qty: v.qty,
        unit: v.unit,
        est_price: v.est_price,
        priority: v.priority,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return { id: (data as { id: string }).id };
  });
}

export async function updateShoppingItem(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "shopping_items", id, "id");
    const v = shoppingItemSchema.partial().parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);

    const { error } = await supabase
      .from("shopping_items")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return undefined as never;
  });
}

export async function toggleShoppingItem(id: string, purchased: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "shopping_items", id, "id");
    const { error } = await supabase
      .from("shopping_items")
      .update({ purchased, purchased_at: purchased ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return undefined as never;
  });
}

export async function deleteShoppingItem(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return undefined as never;
  });
}

/**
 * Turn a purchased item into a real expense.
 * The item keeps a link to the transaction it created, so converting twice is
 * refused rather than silently double-counting the spend.
 */
export async function convertItemToExpense(
  id: string,
  opts?: { amount?: number; account_id?: string | null; payment_method_id?: string | null }
): Promise<ActionResult<{ transactionId: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const item = await requireOwnedRow<ShoppingItem>(
      supabase,
      userId,
      "shopping_items",
      id
    );

    if (item.transaction_id) {
      throw new ActionError("This item is already recorded as an expense.");
    }

    const amount =
      opts?.amount ??
      (item.est_price != null
        ? Number(item.est_price) * (item.qty != null ? Number(item.qty) : 1)
        : 0);
    if (!(amount > 0)) {
      throw new ActionError("Add a price for this item before converting it to an expense.");
    }

    await assertOwned(supabase, userId, "accounts", [opts?.account_id]);
    await assertOwned(supabase, userId, "payment_methods", [opts?.payment_method_id]);

    let accountId = opts?.account_id ?? null;
    if (!accountId) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      accountId = (acc as { id: string } | null)?.id ?? null;
    }

    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "expense",
        amount,
        category_id: item.category_id,
        account_id: accountId,
        payment_method_id: opts?.payment_method_id ?? null,
        note: item.name,
        qty: item.qty,
        unit_price: item.est_price,
        transaction_date: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));

    const transactionId = (tx as { id: string }).id;
    await supabase
      .from("shopping_items")
      .update({
        purchased: true,
        purchased_at: new Date().toISOString(),
        transaction_id: transactionId,
      })
      .eq("id", id)
      .eq("user_id", userId);

    revalidateShopping();
    ["/dashboard", "/daily", "/monthly", "/reports", "/accounts"].forEach((p) => revalidatePath(p));
    return { transactionId };
  });
}

/** Clear every purchased item from a list in one go. */
export async function clearPurchased(listId?: string | null): Promise<ActionResult<{ removed: number }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    let q = supabase
      .from("shopping_items")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("purchased", true);
    if (listId) q = q.eq("list_id", listId);
    const { count, error } = await q;
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateShopping();
    return { removed: count ?? 0 };
  });
}
