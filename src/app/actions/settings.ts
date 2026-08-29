"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { assertOwned, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteUserFolder } from "@/lib/server/cloudinary";
import { settingsSchema } from "@/lib/validation";
import { CURRENCIES } from "@/lib/format";
import type { ActionResult, Theme } from "@/types";

export async function updateSettings(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = settingsSchema.parse(input);
    await assertOwned(supabase, userId, "accounts", [v.default_account_id]);

    const payload: Record<string, unknown> = { ...v };
    // Symbol always follows the chosen currency code — never set independently.
    if (v.currency_code) {
      const cur = CURRENCIES[v.currency_code.toUpperCase()];
      if (!cur) throw new ActionError("That currency is not supported yet.");
      payload.currency_code = cur.code;
      payload.currency_symbol = cur.symbol;
    }
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...payload }, { onConflict: "user_id" });
    if (error) throw new ActionError(friendlyDbError(error.message));

    revalidatePath("/", "layout");
    return undefined as never;
  });
}

/**
 * Theme is stored per user AND mirrored into a cookie, so the server can render
 * the correct theme on the very first paint (no flash of the wrong palette).
 */
export async function setTheme(theme: Theme): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const jar = await cookies();
    jar.set("khata-theme", theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, theme }, { onConflict: "user_id" });
    revalidatePath("/", "layout");
    return undefined as never;
  });
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    let q = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (ids?.length) q = q.in("id", ids);
    const { error } = await q;
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/", "layout");
    return undefined as never;
  });
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidatePath("/", "layout");
    return undefined as never;
  });
}

/**
 * Wipe every row this user owns, keeping the login itself.
 * Runs under the user's own session, so RLS guarantees nothing outside their
 * account can be touched even if a table name were wrong.
 */
export async function eraseAllData(confirmation: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    if (confirmation.trim().toUpperCase() !== "DELETE") {
      throw new ActionError('Type DELETE to confirm.');
    }

    // Order matters: children before parents.
    const tables = [
      "transaction_tags",
      "khata_payments",
      "khata_entries",
      "khata_people",
      "receipts",
      "shopping_items",
      "shopping_lists",
      "notifications",
      "reminders",
      "recurring_rules",
      "budgets",
      "common_choices",
      "transactions",
      "subcategories",
      "categories",
      "account_balances",
      "accounts",
      "payment_methods",
      "vendors",
      "tags",
    ] as const;

    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq("user_id", userId);
      if (error) throw new ActionError(friendlyDbError(error.message));
    }

    // Remove their uploaded receipt images as well, so nothing is left behind
    // in Cloudinary after the database rows are gone.
    await deleteUserFolder(userId);

    revalidatePath("/", "layout");
    return undefined as never;
  });
}

/**
 * Permanently delete the account and the auth user.
 * Requires the service-role key (only the admin API can remove an auth user);
 * the id deleted is always the verified session's own id.
 */
export async function deleteAccountPermanently(
  confirmation: string
): Promise<ActionResult> {
  const wipe = await eraseAllData(confirmation);
  if (!wipe.ok) return wipe;

  const outcome = await run(async () => {
    const { userId } = await requireUser();
    const service = createServiceClient();
    if (!service) {
      throw new ActionError(
        "Account deletion is not configured on this server. Your data has been erased — contact support to remove the login."
      );
    }
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) throw new ActionError(error.message);
    return undefined as never;
  });

  if (!outcome.ok) return outcome;
  redirect("/login");
}
