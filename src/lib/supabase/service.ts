import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { DbClient } from "@/types/supabase";

/**
 * Server-only service-role client.
 *
 * Bypasses RLS, so it is used for exactly two things:
 *   1. seeding a brand-new user's default categories/accounts at sign-up, and
 *   2. deleting an auth user (only the admin API can do this).
 * Both always act on an id that came from a verified session — never from
 * client input. The key must not be exposed to the browser: do NOT rename the
 * env var with a NEXT_PUBLIC_ prefix.
 *
 * Returns null when unconfigured so callers can degrade gracefully rather than
 * crashing a sign-up.
 */
export function createServiceClient(): DbClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY is not set — new-user seeding and account deletion are disabled."
    );
    return null;
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
