"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { assertOwned, requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { budgetSchema } from "@/lib/validation";
import type { ActionResult } from "@/types";

function revalidateBudgets() {
  ["/budgets", "/dashboard", "/reports", "/insights"].forEach((p) => revalidatePath(p));
}

export async function createBudget(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = budgetSchema.parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);
    await assertOwned(supabase, userId, "accounts", [v.account_id]);

    const { data, error } = await supabase
      .from("budgets")
      .insert({
        user_id: userId,
        name: v.name,
        amount: v.amount,
        period: v.period,
        category_id: v.category_id,
        account_id: v.account_id,
        starts_on: v.starts_on ?? new Date().toISOString().slice(0, 10),
        alert_at_pct: v.alert_at_pct,
        is_active: v.is_active,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateBudgets();
    return { id: (data as { id: string }).id };
  });
}

export async function updateBudget(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "budgets", id, "id");
    const v = budgetSchema.partial().parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);
    await assertOwned(supabase, userId, "accounts", [v.account_id]);

    const { error } = await supabase
      .from("budgets")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateBudgets();
    return undefined as never;
  });
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateBudgets();
    return undefined as never;
  });
}
