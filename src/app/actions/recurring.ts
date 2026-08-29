"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { assertOwned, requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { recurringSchema, reminderSchema } from "@/lib/validation";
import type { ActionResult, RecurringRule } from "@/types";

function revalidateRecurring() {
  ["/recurring", "/reminders", "/dashboard", "/transactions"].forEach((p) => revalidatePath(p));
}

/** Next occurrence after `from`, honouring frequency + interval. */
function advance(from: Date, frequency: string, step: number): Date {
  const d = new Date(from);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + step);
      break;
    case "weekly":
      d.setDate(d.getDate() + step * 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + step);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setDate(d.getDate() + step);
  }
  return d;
}

export async function createRecurring(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = recurringSchema.parse(input);
    await Promise.all([
      assertOwned(supabase, userId, "categories", [v.category_id]),
      assertOwned(supabase, userId, "accounts", [v.account_id]),
      assertOwned(supabase, userId, "payment_methods", [v.payment_method_id]),
      assertOwned(supabase, userId, "vendors", [v.vendor_id]),
    ]);

    const { data, error } = await supabase
      .from("recurring_rules")
      .insert({
        user_id: userId,
        title: v.title,
        amount: v.amount,
        type: v.type,
        category_id: v.category_id,
        account_id: v.account_id,
        payment_method_id: v.payment_method_id,
        vendor_id: v.vendor_id,
        note: v.note,
        frequency: v.frequency,
        interval_step: v.interval_step,
        next_run: v.next_run ?? new Date().toISOString().slice(0, 10),
        auto_post: v.auto_post,
        remind_days_before: v.remind_days_before,
        is_active: v.is_active,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateRecurring();
    return { id: (data as { id: string }).id };
  });
}

export async function updateRecurring(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "recurring_rules", id, "id");
    const v = recurringSchema.partial().parse(input);
    await Promise.all([
      assertOwned(supabase, userId, "categories", [v.category_id]),
      assertOwned(supabase, userId, "accounts", [v.account_id]),
      assertOwned(supabase, userId, "payment_methods", [v.payment_method_id]),
      assertOwned(supabase, userId, "vendors", [v.vendor_id]),
    ]);

    const { error } = await supabase
      .from("recurring_rules")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateRecurring();
    return undefined as never;
  });
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("recurring_rules")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateRecurring();
    return undefined as never;
  });
}

export async function toggleRecurring(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "recurring_rules", id, "id");
    const { error } = await supabase
      .from("recurring_rules")
      .update({ is_active: active })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateRecurring();
    return undefined as never;
  });
}

/**
 * Post a single rule now (the "Pay / Log it" button on a due bill) and roll its
 * schedule forward one step.
 */
export async function postRecurringNow(id: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const rule = await requireOwnedRow<RecurringRule>(
      supabase,
      userId,
      "recurring_rules",
      id
    );

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: rule.type,
        amount: rule.amount,
        category_id: rule.category_id,
        account_id: rule.account_id,
        payment_method_id: rule.payment_method_id,
        vendor_id: rule.vendor_id,
        note: rule.note ?? rule.title,
        transaction_date: new Date().toISOString(),
        is_recurring: true,
        is_recurring_rule_id: rule.id,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));

    const base = rule.next_run ? new Date(rule.next_run) : new Date();
    const next = advance(base, rule.frequency, rule.interval_step);
    await supabase
      .from("recurring_rules")
      .update({
        next_run: next.toISOString().slice(0, 10),
        last_generated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);

    revalidateRecurring();
    ["/dashboard", "/daily", "/monthly", "/reports", "/accounts"].forEach((p) => revalidatePath(p));
    return { id: (data as { id: string }).id };
  });
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------
export async function createReminder(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = reminderSchema.parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);
    const { data, error } = await supabase
      .from("reminders")
      .insert({ user_id: userId, ...v })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/reminders");
    return { id: (data as { id: string }).id };
  });
}

export async function updateReminder(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "reminders", id, "id");
    const v = reminderSchema.partial().parse(input);
    const { error } = await supabase
      .from("reminders")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/reminders");
    return undefined as never;
  });
}

export async function toggleReminder(id: string, done: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "reminders", id, "id");
    const { error } = await supabase
      .from("reminders")
      .update({ done })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/reminders");
    return undefined as never;
  });
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/reminders");
    return undefined as never;
  });
}
