import "server-only";

import { requireUser } from "./session";
import { generateNotifications } from "./notify";
import { postDueRecurring } from "@/app/actions/transactions";

// ============================================================================
// The once-a-day housekeeping pass.
//
// Posting due recurring bills and regenerating notifications used to run on
// EVERY navigation, in two blocking waves before the page fetched anything of
// its own: a write RPC plus 6-9 queries, several of which re-read data the page
// was about to read again. On a connection where a single round trip costs
// ~300ms that was most of the wait on every tab switch.
//
// Neither job needs that frequency — a bill comes due once, and notifications
// are deduped to one per thing per UTC day by the `notifications_dedupe` index.
// So the pass now runs at most once a day per user. The trade-off is that a bill
// due mid-afternoon posts on the next visit rather than the exact moment it
// falls due.
// ============================================================================

/**
 * Atomically claims today's maintenance slot.
 *
 * The UPDATE only matches while `last_maintenance_at` is still stale, so two
 * concurrent requests cannot both win: whoever writes first leaves nothing for
 * the other to match. That matters because `post_due_recurring` inserts real
 * transactions — running it twice would double-post the bill.
 *
 * Returns false for a user with no settings row yet (a signed-up but not yet
 * onboarded account); the layout sends them to /onboarding regardless.
 */
export async function claimDailyMaintenance(): Promise<boolean> {
  const { supabase, userId } = await requireUser();

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("user_settings")
    .update({ last_maintenance_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`last_maintenance_at.is.null,last_maintenance_at.lt.${startOfUtcDay.toISOString()}`)
    .select("user_id");

  if (error) {
    // Housekeeping must never break the page. Skipping today is harmless: the
    // next day's claim picks up whatever was missed.
    console.error("[maintenance] claim failed:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Runs the pass. Call only after {@link claimDailyMaintenance} returns true.
 *
 * Sequential by necessity: a bill that auto-posts here must not then also be
 * reported as still due, which is why the notification pass follows rather than
 * runs alongside.
 */
export async function runDailyMaintenance(): Promise<void> {
  try {
    await postDueRecurring();
    await generateNotifications();
  } catch (err) {
    console.error("[maintenance] pass failed:", err);
  }
}
