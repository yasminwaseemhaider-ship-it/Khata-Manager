"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { requireOwnedRow, run, ActionError, friendlyDbError, assertOwned } from "@/lib/server/guards";
import { categorySchema, subcategorySchema, namedSchema } from "@/lib/validation";
import type { ActionResult } from "@/types";

const TAXONOMY_PATHS = ["/settings", "/transactions", "/dashboard", "/reports"];
function revalidateTaxonomy() {
  for (const p of TAXONOMY_PATHS) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = categorySchema.parse(input);
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        name: v.name,
        type: v.type,
        icon: v.icon,
        color: v.color,
        sort_order: v.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return { id: (data as { id: string }).id };
  });
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "categories", id, "id");
    const v = categorySchema.partial().parse(input);
    const { error } = await supabase
      .from("categories")
      .update(v)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

/**
 * Archiving is the default: it keeps historical transactions readable.
 * Hard delete is offered only when nothing references the category.
 */
export async function archiveCategory(
  id: string,
  archived = true
): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "categories", id, "id");
    const { error } = await supabase
      .from("categories")
      .update({ is_archived: archived })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "categories", id, "id");

    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("category_id", id);

    if ((count ?? 0) > 0) {
      throw new ActionError(
        `${count} transaction${count === 1 ? "" : "s"} still use this category. Archive it instead to keep your history intact.`
      );
    }
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

// ---------------------------------------------------------------------------
// Subcategories
// ---------------------------------------------------------------------------
export async function createSubcategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = subcategorySchema.parse(input);
    await assertOwned(supabase, userId, "categories", [v.category_id]);
    const { data, error } = await supabase
      .from("subcategories")
      .insert({
        user_id: userId,
        category_id: v.category_id,
        name: v.name,
        icon: v.icon,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return { id: (data as { id: string }).id };
  });
}

export async function renameSubcategory(id: string, name: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "subcategories", id, "id");
    const clean = name.trim();
    if (!clean) throw new ActionError("Name is required.");
    const { error } = await supabase
      .from("subcategories")
      .update({ name: clean })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

export async function deleteSubcategory(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "subcategories", id, "id");
    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

// ---------------------------------------------------------------------------
// Payment methods / vendors / tags — same shape, one generic pair of actions.
// ---------------------------------------------------------------------------
type SimpleTable = "payment_methods" | "vendors" | "tags";

export async function createNamed(
  table: SimpleTable,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = namedSchema.parse(input);
    const payload: Record<string, unknown> = { user_id: userId, name: v.name };
    if (table === "tags") payload.color = v.color;
    if (table !== "tags") payload.icon = v.icon;

    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return { id: (data as { id: string }).id };
  });
}

export async function updateNamed(
  table: SimpleTable,
  id: string,
  input: unknown
): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, table, id, "id");
    const v = namedSchema.partial().parse(input);
    const payload: Record<string, unknown> = {};
    if (v.name) payload.name = v.name;
    if (table === "tags" && v.color !== undefined) payload.color = v.color;
    if (table !== "tags" && v.icon !== undefined) payload.icon = v.icon;

    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}

export async function deleteNamed(
  table: SimpleTable,
  id: string
): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, table, id, "id");
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateTaxonomy();
    return undefined as never;
  });
}
