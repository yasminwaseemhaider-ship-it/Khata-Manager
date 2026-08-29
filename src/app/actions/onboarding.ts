"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { CURRENCIES } from "@/lib/format";
import type { ActionResult } from "@/types";

/**
 * Default categories, subcategories, payment methods and accounts for a new
 * account — the same set sign-up seeds, but run under the USER'S OWN SESSION.
 *
 * Sign-up seeds with the service-role key, which is not always configured (and
 * cannot run at all for accounts created before this existed). Onboarding
 * therefore seeds too: RLS allows a user to insert their own rows, so no
 * elevated key is needed and there is no way for the app to get stuck with a
 * signed-in user who has no categories.
 */
const EXPENSE_CATEGORIES = [
  { name: "Grocery", icon: "ShoppingCart", color: "#059669" },
  { name: "Home & Household", icon: "House", color: "#84cc16" },
  { name: "Food", icon: "UtensilsCrossed", color: "#f59e0b" },
  { name: "Transport", icon: "Car", color: "#3b82f6" },
  { name: "Bills", icon: "Receipt", color: "#64748b" },
  { name: "Health", icon: "HeartPulse", color: "#ec4899" },
  { name: "Education", icon: "GraduationCap", color: "#6366f1" },
  { name: "Personal", icon: "Sparkles", color: "#a855f7" },
  { name: "Shopping", icon: "ShoppingBag", color: "#14b8a6" },
  { name: "Entertainment", icon: "Clapperboard", color: "#f97316" },
  { name: "Other", icon: "Tag", color: "#94a3b8" },
];

const INCOME_CATEGORIES = [
  { name: "Salary", icon: "Wallet", color: "#059669" },
  { name: "Business", icon: "Briefcase", color: "#3b82f6" },
  { name: "Freelance", icon: "Laptop", color: "#8b5cf6" },
  { name: "Rent", icon: "Home", color: "#14b8a6" },
  { name: "Investment", icon: "TrendingUp", color: "#f59e0b" },
  { name: "Other", icon: "CirclePlus", color: "#94a3b8" },
];

const SUBCATEGORIES: Record<string, string[]> = {
  Grocery: ["Vegetables & fruit", "Dairy", "Meat", "Dry goods"],
  Bills: ["Electricity", "Gas", "Water", "Internet", "Mobile"],
  Transport: ["Fuel", "Ride hailing", "Public transport", "Maintenance"],
  "Home & Household": ["Rent", "Repairs", "Cleaning", "Furniture"],
};

const PAYMENT_METHODS = [
  "Cash", "Bank Transfer", "Credit Card", "Debit Card", "JazzCash", "Easypaisa", "Sadapay",
];

export interface SetupInput {
  displayName?: string | null;
  currencyCode?: string;
  cashBalance?: number | string | null;
  bankBalance?: number | string | null;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Idempotent: safe to call more than once. Each section is only created when
 * the user has none, so re-running never duplicates a user's own categories.
 */
export async function completeOnboarding(
  input: SetupInput = {}
): Promise<ActionResult<{ seeded: boolean }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();

    const currency = CURRENCIES[(input.currencyCode ?? "PKR").toUpperCase()] ?? CURRENCIES.PKR;

    // ---- Categories ----
    const { data: existingCats } = await supabase
      .from("categories")
      .select("id, name, type")
      .eq("user_id", userId);

    let seeded = false;
    let categories = (existingCats ?? []) as { id: string; name: string; type: string }[];

    if (categories.length === 0) {
      const rows = [
        ...EXPENSE_CATEGORIES.map((c, i) => ({
          ...c, user_id: userId, type: "expense", sort_order: i,
        })),
        ...INCOME_CATEGORIES.map((c, i) => ({
          ...c, user_id: userId, type: "income", sort_order: i,
        })),
      ];
      const { data: inserted, error } = await supabase
        .from("categories")
        .insert(rows)
        .select("id, name, type");
      if (error) throw new ActionError(friendlyDbError(error.message));

      categories = (inserted ?? []) as { id: string; name: string; type: string }[];
      seeded = true;

      const byName = new Map(
        categories.filter((c) => c.type === "expense").map((c) => [c.name, c.id])
      );
      const subRows = Object.entries(SUBCATEGORIES).flatMap(([parent, names]) => {
        const parentId = byName.get(parent);
        if (!parentId) return [];
        return names.map((name, i) => ({
          user_id: userId,
          category_id: parentId,
          name,
          sort_order: i,
        }));
      });
      if (subRows.length) await supabase.from("subcategories").insert(subRows);
    }

    // ---- Payment methods ----
    const { count: pmCount } = await supabase
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((pmCount ?? 0) === 0) {
      await supabase
        .from("payment_methods")
        .insert(PAYMENT_METHODS.map((name) => ({ user_id: userId, name })));
    }

    // ---- Accounts ----
    const cash = toNumber(input.cashBalance);
    const bank = toNumber(input.bankBalance);

    const { data: existingAccounts } = await supabase
      .from("accounts")
      .select("id, name, is_default")
      .eq("user_id", userId);

    let accounts = (existingAccounts ?? []) as { id: string; name: string; is_default: boolean }[];

    if (accounts.length === 0) {
      const { data: inserted, error } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: userId,
            name: "Cash",
            type: "cash",
            opening_balance: cash,
            currency_code: currency.code,
            is_default: true,
          },
          {
            user_id: userId,
            name: "Bank",
            type: "bank",
            opening_balance: bank,
            currency_code: currency.code,
            is_default: false,
          },
        ])
        .select("id, name, is_default");
      if (error) throw new ActionError(friendlyDbError(error.message));
      accounts = (inserted ?? []) as typeof accounts;
    } else if (cash > 0 || bank > 0) {
      // Returning user re-running setup: update the opening balances instead.
      const cashAcc = accounts.find((a) => a.name === "Cash");
      const bankAcc = accounts.find((a) => a.name === "Bank");
      if (cashAcc && cash > 0) {
        await supabase
          .from("accounts")
          .update({ opening_balance: cash })
          .eq("id", cashAcc.id)
          .eq("user_id", userId);
      }
      if (bankAcc && bank > 0) {
        await supabase
          .from("accounts")
          .update({ opening_balance: bank })
          .eq("id", bankAcc.id)
          .eq("user_id", userId);
      }
    }

    const defaultAccountId = accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? null;

    // ---- Shopping list ----
    const { count: listCount } = await supabase
      .from("shopping_lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((listCount ?? 0) === 0) {
      await supabase.from("shopping_lists").insert({ user_id: userId, name: "Household" });
    }

    // ---- Settings ----
    const { error: settingsError } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        ...(input.displayName ? { display_name: input.displayName.trim() } : {}),
        currency_code: currency.code,
        currency_symbol: currency.symbol,
        default_account_id: defaultAccountId,
      },
      { onConflict: "user_id" }
    );
    if (settingsError) throw new ActionError(friendlyDbError(settingsError.message));

    revalidatePath("/", "layout");
    return { seeded };
  });
}

/** Has this account finished setup? Used to decide whether to show onboarding. */
export async function needsOnboarding(): Promise<boolean> {
  try {
    const { supabase, userId } = await requireUser();
    const { count } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}
