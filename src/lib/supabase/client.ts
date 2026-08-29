// ============================================================================
// Browser Supabase client (anon key + RLS).
//
// Used for READS in client components only. Every mutation goes through a
// server action in src/app/actions/* so ownership is enforced on the server.
// ============================================================================
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
