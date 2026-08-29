import "server-only";

import { requireUser } from "./session";
import { budgetProgress } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { relativeDue } from "@/lib/date";
import type { Budget, KhataEntry, RecurringRule, Transaction, UserSettings } from "@/types";

/**
 * Generates the in-app notifications the bell shows.
 *
 * Called once per app-shell render. It is cheap and safe to re-run: the
 * `notifications_dedupe` unique index (user + kind + ref_id + UTC day) means a
 * repeat insert for the same source on the same day is rejected, so the user
 * gets one nag per thing per day rather than one per page view.
 */

interface PendingNotification {
  kind: "budget" | "bill" | "khata" | "recurring" | "system";
  title: string;
  body: string;
  link: string;
  ref_id: string;
}

export async function generateNotifications(): Promise<number> {
  try {
    const { supabase, userId } = await requireUser();

    const [
      { data: settingsRow },
      { data: budgetRows },
      { data: txRows },
      { data: ruleRows },
      { data: khataRows },
      { data: catRows },
    ] = await Promise.all([
      supabase.from("user_settings").select().eq("user_id", userId).maybeSingle(),
      supabase.from("budgets").select().eq("user_id", userId).eq("is_active", true),
      // Only the current year is needed: every budget window falls inside it.
      supabase
        .from("transactions")
        .select("id, type, amount, category_id, account_id, transaction_date")
        .eq("user_id", userId)
        .gte("transaction_date", new Date(new Date().getFullYear(), 0, 1).toISOString()),
      supabase
        .from("recurring_rules")
        .select()
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase
        .from("khata_entries")
        .select()
        .eq("user_id", userId)
        .neq("status", "settled"),
      supabase.from("categories").select("id, name").eq("user_id", userId),
    ]);

    const settings = settingsRow as UserSettings | null;
    const symbol = settings?.currency_symbol ?? "Rs.";
    const weekStart = settings?.week_starts_on ?? 1;
    const money = (n: number) => formatMoney(n, symbol);

    const categories = (catRows ?? []) as { id: string; name: string }[];
    const transactions = ((txRows ?? []) as Transaction[]).map((t) => ({
      ...t,
      amount: Number(t.amount),
    }));

    const pending: PendingNotification[] = [];

    // ---- Budgets ----
    if (settings?.notify_budgets !== false) {
      for (const b of (budgetRows ?? []) as Budget[]) {
        const p = budgetProgress(
          { ...b, amount: Number(b.amount) },
          transactions,
          categories,
          new Date(),
          weekStart
        );
        if (p.state === "exceeded") {
          pending.push({
            kind: "budget",
            title: `${b.name} is over budget`,
            body: `${money(p.spent)} spent of ${money(p.amount)} — ${money(
              Math.abs(p.remaining)
            )} over for ${p.periodLabel}.`,
            link: "/budgets",
            ref_id: b.id,
          });
        } else if (p.state === "warning") {
          pending.push({
            kind: "budget",
            title: `${b.name} is at ${p.pct.toFixed(0)}%`,
            body: `${money(p.remaining)} left of ${money(p.amount)} for ${p.periodLabel}.`,
            link: "/budgets",
            ref_id: b.id,
          });
        }
      }
    }

    // ---- Bills due soon / overdue ----
    if (settings?.notify_bills !== false) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const r of (ruleRows ?? []) as RecurringRule[]) {
        if (!r.next_run) continue;

        const due = new Date(r.next_run);
        due.setHours(0, 0, 0, 0);
        const daysAway = Math.round((due.getTime() - today.getTime()) / 86_400_000);

        // Only speak up inside the rule's own reminder window (or once overdue).
        // auto_post rules are posted by the RPC, so they only matter if late.
        if (daysAway > (r.remind_days_before ?? 1)) continue;
        if (r.auto_post && daysAway >= 0) continue;

        const { label } = relativeDue(r.next_run);
        pending.push({
          kind: "bill",
          title: `${r.title ?? r.note ?? "Bill"} — ${label.toLowerCase()}`,
          body: `${money(Number(r.amount))} ${
            daysAway < 0 ? "was due" : "is due"
          } on ${due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}.`,
          link: "/recurring",
          ref_id: r.id,
        });
      }
    }

    // ---- Khata overdue ----
    {
      const entries = (khataRows ?? []) as KhataEntry[];
      const paidByEntry = new Map<string, number>();

      if (entries.length) {
        const { data: pays } = await supabase
          .from("khata_payments")
          .select("khata_entry_id, amount")
          .eq("user_id", userId);
        for (const p of (pays ?? []) as { khata_entry_id: string; amount: number }[]) {
          paidByEntry.set(
            p.khata_entry_id,
            (paidByEntry.get(p.khata_entry_id) ?? 0) + Number(p.amount)
          );
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const e of entries) {
        if (!e.due_date) continue;
        const remaining = Number(e.amount) - (paidByEntry.get(e.id) ?? 0);
        if (remaining <= 0) continue;
        if (new Date(e.due_date).getTime() >= today.getTime()) continue;

        pending.push({
          kind: "khata",
          title:
            e.direction === "owed"
              ? `${e.person_name} owes you ${money(remaining)}`
              : `You owe ${e.person_name} ${money(remaining)}`,
          body: `Was due on ${new Date(e.due_date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}.`,
          link: "/khata",
          ref_id: e.id,
        });
      }
    }

    if (pending.length === 0) return 0;

    // Filter out anything already raised today before inserting.
    //
    // The dedupe index is on an EXPRESSION ((created_at at time zone 'UTC')::date),
    // which PostgREST's `on_conflict` cannot target — and a batch insert would
    // fail as a whole if any single row collided. So the check happens here, and
    // the index stays as the last-resort guarantee against races.
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const { data: todays } = await supabase
      .from("notifications")
      .select("kind, ref_id")
      .eq("user_id", userId)
      .gte("created_at", startOfDayUtc.toISOString());

    const seen = new Set(
      ((todays ?? []) as { kind: string; ref_id: string | null }[]).map(
        (n) => `${n.kind}|${n.ref_id ?? ""}`
      )
    );

    const fresh = pending.filter((p) => !seen.has(`${p.kind}|${p.ref_id}`));
    if (fresh.length === 0) return 0;

    const { data, error } = await supabase
      .from("notifications")
      .insert(fresh.map((p) => ({ user_id: userId, ...p })))
      .select("id");

    if (error) {
      // A duplicate collision means another request won the race — harmless.
      if (!/duplicate key/i.test(error.message)) {
        console.error("[notifications]", error.message);
      }
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    // Notifications are a nicety — never let them take the app down.
    console.error("[notifications]", err);
    return 0;
  }
}
