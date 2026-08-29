import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client shape used across the server layer.
 *
 * The schema generic is intentionally untyped. Generating real types
 * (`supabase gen types`) requires a project ref at build time, and a
 * hand-written partial stub made supabase-js infer `never` for every insert
 * payload — which broke writes at compile time while providing no real safety.
 *
 * Row shapes are still enforced elsewhere: `src/types/index.ts` declares them,
 * zod validates every action payload, and RLS enforces ownership in Postgres.
 *
 * Declaring the escape hatch once, here, keeps `any` out of everywhere else.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = SupabaseClient<any, "public", any>;
