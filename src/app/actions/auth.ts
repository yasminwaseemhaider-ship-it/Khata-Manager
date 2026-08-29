"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DbClient } from "@/types/supabase";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/server/session";
import { run, ActionError } from "@/lib/server/guards";
import type { ActionResult } from "@/types";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Defaults seeded for a NEW user only, scoped to their own user_id.
 * These match the categories in the product spec.
 */
const DEFAULT_EXPENSE_CATEGORIES = [
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

const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary", icon: "Wallet", color: "#059669" },
  { name: "Business", icon: "Briefcase", color: "#3b82f6" },
  { name: "Freelance", icon: "Laptop", color: "#8b5cf6" },
  { name: "Rent", icon: "Home", color: "#14b8a6" },
  { name: "Investment", icon: "TrendingUp", color: "#f59e0b" },
  { name: "Other", icon: "CirclePlus", color: "#94a3b8" },
];

/** A few sensible subcategories so the feature is discoverable from day one. */
const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  Grocery: ["Vegetables & fruit", "Dairy", "Meat", "Dry goods"],
  Bills: ["Electricity", "Gas", "Water", "Internet", "Mobile"],
  Transport: ["Fuel", "Ride hailing", "Public transport", "Maintenance"],
  "Home & Household": ["Rent", "Repairs", "Cleaning", "Furniture"],
};

const DEFAULT_PAYMENT_METHODS = [
  "Cash", "Bank Transfer", "Credit Card", "Debit Card", "JazzCash", "Easypaisa", "Sadapay",
];

const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "cash", is_default: true },
  { name: "Bank", type: "bank", is_default: false },
];

/**
 * Absolute base URL for the links Supabase emails out (verify, password reset).
 *
 * Server-only: both call sites live in this "use server" file, so this must NOT
 * carry the NEXT_PUBLIC_ prefix — that prefix inlines the value into the client
 * bundle, and Vercel now refuses to store such a variable privately.
 *
 * A localhost value is ignored whenever we are actually running on Vercel. That
 * combination is never intentional: it happens when .env.local gets copied into
 * the Vercel dashboard wholesale, and the symptom is verification emails whose
 * link points at the developer's own machine. VERCEL_PROJECT_PRODUCTION_URL is
 * injected by Vercel and is the stable production host, so it is the right
 * fallback even from a preview deployment.
 */
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function siteUrl(): string {
  const onVercel = Boolean(process.env.VERCEL);
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  const explicit = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  if (explicit && !(onVercel && LOCAL_HOST.test(explicit))) return explicit;

  if (vercelHost) return `https://${vercelHost.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { error: signUpError, data: signUpData } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already registered")) {
      return { error: "An account with that email already exists. Try signing in." };
    }
    return { error: signUpError.message };
  }

  const uid = signUpData.user?.id;
  if (uid) {
    const service = createServiceClient();
    if (service) {
      await seedUserDefaults(service, uid, parsed.data.name);
    } else {
      // Without the service key the trigger-free seed cannot run before the
      // session exists; onboarding will offer to create the defaults instead.
      console.warn("[signup] service key missing — defaults not seeded for", uid);
    }
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Never reveal whether it was the email or the password that was wrong.
    if (error.message.toLowerCase().includes("invalid")) {
      return { error: "Incorrect email or password." };
    }
    if (error.message.toLowerCase().includes("confirm")) {
      return { error: "Please confirm your email address first — check your inbox." };
    }
    return { error: error.message };
  }

  const raw = String(formData.get("redirect") ?? "");
  // Only allow same-origin relative paths, so ?redirect= cannot be used to
  // bounce a freshly-authenticated user to another site.
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function sendPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address." };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Always report success: revealing which emails exist would leak accounts.
  if (error) console.error("[reset]", error.message);
  return { success: true };
}

/** Used by both the reset-password page and Settings → Security. */
export async function changePassword(password: string): Promise<ActionResult> {
  return run(async () => {
    if (password.length < 8) {
      throw new ActionError("Password must be at least 8 characters.");
    }
    const { supabase } = await requireUser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ActionError(error.message);
    return undefined as never;
  });
}

/** Legacy FormData wrapper kept for the reset-password form. */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const res = await changePassword(password);
  return res.ok ? { success: true } : { error: res.error };
}

/**
 * Creates a new user's default categories, subcategories, payment methods and
 * accounts. Uses the service-role client because it runs immediately after
 * sign-up, before the user has a session — but every row is stamped with the
 * user id that sign-up just returned, never with client input.
 */
async function seedUserDefaults(
  service: DbClient,
  userId: string,
  displayName: string
) {
  const catRows = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
      ...c, user_id: userId, type: "expense", sort_order: i,
    })),
    ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({
      ...c, user_id: userId, type: "income", sort_order: i,
    })),
  ];

  const { data: insertedCats } = await service
    .from("categories")
    .insert(catRows)
    .select("id, name, type");

  // Subcategories reference the ids we just created.
  const expenseByName = new Map(
    ((insertedCats ?? []) as { id: string; name: string; type: string }[])
      .filter((c) => c.type === "expense")
      .map((c) => [c.name, c.id])
  );

  const subRows = Object.entries(DEFAULT_SUBCATEGORIES).flatMap(([parent, names]) => {
    const parentId = expenseByName.get(parent);
    if (!parentId) return [];
    return names.map((name, i) => ({
      user_id: userId,
      category_id: parentId,
      name,
      sort_order: i,
    }));
  });
  if (subRows.length) await service.from("subcategories").insert(subRows);

  await service
    .from("payment_methods")
    .insert(DEFAULT_PAYMENT_METHODS.map((name) => ({ user_id: userId, name })));

  const { data: accs } = await service
    .from("accounts")
    .insert(
      DEFAULT_ACCOUNTS.map((a) => ({
        user_id: userId,
        name: a.name,
        type: a.type,
        opening_balance: 0,
        is_default: a.is_default,
      }))
    )
    .select("id, is_default");

  const defaultAccountId =
    ((accs ?? []) as { id: string; is_default: boolean }[]).find((a) => a.is_default)?.id ?? null;

  await service.from("user_settings").upsert({
    user_id: userId,
    display_name: displayName,
    currency_code: "PKR",
    currency_symbol: "Rs.",
    theme: "system",
    week_starts_on: 1,
    default_account_id: defaultAccountId,
  });

  await service.from("shopping_lists").insert({ user_id: userId, name: "Household" });
}
