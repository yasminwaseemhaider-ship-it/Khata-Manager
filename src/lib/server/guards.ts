import "server-only";

import type { ActionResult } from "@/types";
import type { DbClient } from "@/types/supabase";
import { AuthError } from "./session";

/**
 * Ownership guards.
 *
 * RLS stops a user READING or WRITING another user's rows, but it does NOT stop
 * them *referencing* one: a crafted request could attach someone else's
 * category_id to their own transaction, because the FK check runs with elevated
 * privileges. So every foreign key supplied by the client is verified here to
 * belong to the acting user before it is written.
 */

export class OwnershipError extends Error {
  constructor(message = "That item does not exist.") {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * An error we raised on purpose, with a message meant for the user
 * ("That is more than the amount outstanding", a mapped database error, …).
 * Anything that is NOT one of these is treated as an unexpected crash and
 * reported generically, so internals never leak.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

type OwnedTable =
  | "categories"
  | "subcategories"
  | "accounts"
  | "payment_methods"
  | "vendors"
  | "tags"
  | "transactions"
  | "budgets"
  | "recurring_rules"
  | "shopping_lists"
  | "shopping_items"
  | "khata_people"
  | "khata_entries"
  | "khata_payments"
  | "receipts"
  | "reminders"
  | "notifications";

/**
 * Assert every non-null id in `ids` exists in `table` and belongs to `userId`.
 * Null/undefined ids are skipped (they mean "not set").
 */
export async function assertOwned(
  supabase: DbClient,
  userId: string,
  table: OwnedTable,
  ids: (string | null | undefined)[]
): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return;

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .in("id", wanted);

  if (error) throw new OwnershipError(error.message);
  const found = new Set((data ?? []).map((r: { id: string }) => r.id));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new OwnershipError(
      `Referenced ${table.replace(/_/g, " ")} not found in your account.`
    );
  }
}

/** Assert a single row exists and is owned; returns the row. */
export async function requireOwnedRow<T = Record<string, unknown>>(
  supabase: DbClient,
  userId: string,
  table: OwnedTable,
  id: string,
  columns = "*"
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new OwnershipError(error.message);
  if (!data) throw new OwnershipError("That item does not exist.");
  return data as T;
}

/**
 * Wrap an action body so it always resolves to an ActionResult instead of
 * throwing across the server/client boundary. Expected failures (auth,
 * ownership, validation) become friendly messages; anything else is logged
 * server-side and reported generically so internals never leak to the client.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (err) {
    // Next.js redirect()/notFound() throw control-flow errors — never swallow.
    // Checked first: a redirect must not be turned into an error message.
    if (err && typeof err === "object" && "digest" in err) throw err;

    if (
      err instanceof AuthError ||
      err instanceof OwnershipError ||
      err instanceof ActionError
    ) {
      return { ok: false, error: err.message };
    }
    if (err && typeof err === "object" && "issues" in err) {
      // ZodError — surface the first field message.
      const issues = (err as { issues: { message: string }[] }).issues;
      return { ok: false, error: issues[0]?.message ?? "Invalid input." };
    }

    console.error("[action]", err);

    // In development, show the real reason: a generic message here costs hours
    // of guessing when the true cause is something like a missing GRANT.
    if (process.env.NODE_ENV !== "production" && err instanceof Error) {
      return { ok: false, error: `${err.message} (dev detail)` };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Postgres errors mapped to messages a human would want to read. */
export function friendlyDbError(message: string): string {
  if (message.includes("duplicate key")) return "That already exists.";
  if (message.includes("transfer_needs_target"))
    return "A transfer needs a destination account.";
  if (message.includes("transfer_distinct_accounts"))
    return "Choose two different accounts for a transfer.";
  if (message.includes("violates check constraint")) return "That value is not allowed.";
  if (message.includes("violates foreign key")) return "A linked item no longer exists.";
  return message;
}
