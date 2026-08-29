"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { accountSchema } from "@/lib/validation";
import type { ActionResult } from "@/types";

function revalidateAccounts() {
  ["/accounts", "/dashboard", "/transactions", "/settings", "/reports"].forEach((p) => revalidatePath(p));
}

export async function createAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = accountSchema.parse(input);

    if (v.is_default) {
      await supabase
        .from("accounts")
        .update({ is_default: false })
        .eq("user_id", userId);
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: v.name,
        type: v.type ?? "cash",
        opening_balance: v.opening_balance ?? 0,
        currency_code: v.currency_code ?? "PKR",
        icon: v.icon,
        color: v.color,
        is_default: v.is_default ?? false,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateAccounts();
    return { id: (data as { id: string }).id };
  });
}

export async function updateAccount(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "accounts", id, "id");
    const v = accountSchema.partial().parse(input);

    if (v.is_default) {
      await supabase.from("accounts").update({ is_default: false }).eq("user_id", userId);
    }

    const { error } = await supabase
      .from("accounts")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateAccounts();
    return undefined as never;
  });
}

export async function archiveAccount(id: string, archived = true): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "accounts", id, "id");
    const { error } = await supabase
      .from("accounts")
      .update({ is_archived: archived })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateAccounts();
    return undefined as never;
  });
}

/**
 * Deleting an account would orphan its transactions (the FK is ON DELETE SET
 * NULL), silently detaching real money from its source — so we refuse while
 * any transaction still points at it and steer the user to archiving.
 */
export async function deleteAccount(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "accounts", id, "id");

    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`account_id.eq.${id},transfer_to_account_id.eq.${id}`);

    if ((count ?? 0) > 0) {
      throw new ActionError(
        `${count} transaction${count === 1 ? "" : "s"} belong to this account. Archive it instead so your history stays correct.`
      );
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateAccounts();
    return undefined as never;
  });
}

export async function setDefaultAccount(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "accounts", id, "id");
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", userId);
    await supabase
      .from("accounts")
      .update({ is_default: true })
      .eq("id", id)
      .eq("user_id", userId);
    await supabase
      .from("user_settings")
      .update({ default_account_id: id })
      .eq("user_id", userId);
    revalidateAccounts();
    return undefined as never;
  });
}
