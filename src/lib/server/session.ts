import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DbClient } from "@/types/supabase";

export class AuthError extends Error {
  constructor(message = "You must be signed in to do that.") {
    super(message);
    this.name = "AuthError";
  }
}

export interface Session {
  supabase: DbClient;
  userId: string;
  email: string;
}

/**
 * The single source of truth for "who is acting".
 *
 * Always uses `auth.getUser()` (which verifies the JWT against the Supabase
 * auth server) rather than `getSession()` (which trusts an unverified cookie).
 * No mutation in this app may take a user id from client input — it comes from
 * here or it does not exist.
 *
 * `cache()` dedupes the call within a single server render/request.
 */
export const requireUser = cache(async function requireUser(): Promise<Session> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new AuthError();
  return { supabase, userId: user.id, email: user.email ?? "" };
});

/** Same, but returns null instead of throwing (for optional-auth reads). */
export async function getOptionalUser(): Promise<Session | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
