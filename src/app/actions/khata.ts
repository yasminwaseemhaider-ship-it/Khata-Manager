"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { assertOwned, requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import { khataEntrySchema, khataPaymentSchema } from "@/lib/validation";
import type { ActionResult, KhataEntry } from "@/types";

function revalidateKhata() {
  ["/khata", "/dashboard"].forEach((p) => revalidatePath(p));
}

/** Find-or-create the person so the ledger groups by a real row, not a string. */
async function resolvePerson(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  personId: string | null,
  name: string
): Promise<{ id: string | null; name: string }> {
  if (personId) {
    const row = await requireOwnedRow<{ id: string; name: string }>(
      supabase,
      userId,
      "khata_people",
      personId,
      "id, name"
    );
    return { id: row.id, name: row.name };
  }

  const { data: existing } = await supabase
    .from("khata_people")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };

  const { data: created, error } = await supabase
    .from("khata_people")
    .insert({ user_id: userId, name })
    .select("id, name")
    .single();
  if (error) return { id: null, name };
  return created as { id: string; name: string };
}

export async function createKhataEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = khataEntrySchema.parse(input);
    const person = await resolvePerson(supabase, userId, v.person_id, v.person_name);

    const { data, error } = await supabase
      .from("khata_entries")
      .insert({
        user_id: userId,
        person_id: person.id,
        person_name: person.name,
        direction: v.direction,
        amount: v.amount,
        note: v.note,
        entry_date: v.entry_date ?? new Date().toISOString().slice(0, 10),
        due_date: v.due_date,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateKhata();
    return { id: (data as { id: string }).id };
  });
}

export async function updateKhataEntry(id: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await requireOwnedRow(supabase, userId, "khata_entries", id, "id");
    const v = khataEntrySchema.partial().parse(input);

    const payload: Record<string, unknown> = {
      direction: v.direction,
      amount: v.amount,
      note: v.note,
      entry_date: v.entry_date,
      due_date: v.due_date,
    };
    if (v.person_name) {
      const person = await resolvePerson(supabase, userId, v.person_id ?? null, v.person_name);
      payload.person_id = person.id;
      payload.person_name = person.name;
    }
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    const { error } = await supabase
      .from("khata_entries")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));

    // The status trigger only fires on payments, so re-derive after an amount edit.
    await refreshEntryStatus(supabase, userId, id);
    revalidateKhata();
    return undefined as never;
  });
}

async function refreshEntryStatus(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  entryId: string
) {
  const entry = await requireOwnedRow<KhataEntry>(
    supabase,
    userId,
    "khata_entries",
    entryId,
    "id, amount"
  );
  const { data: pays } = await supabase
    .from("khata_payments")
    .select("amount")
    .eq("user_id", userId)
    .eq("khata_entry_id", entryId);
  const paid = (pays ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const status =
    paid <= 0 ? "open" : paid >= Number(entry.amount) ? "settled" : "partially_paid";
  await supabase
    .from("khata_entries")
    .update({ status })
    .eq("id", entryId)
    .eq("user_id", userId);
}

export async function deleteKhataEntry(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("khata_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateKhata();
    return undefined as never;
  });
}

/** Record a partial (or full) repayment against an entry. */
export async function addKhataPayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const v = khataPaymentSchema.parse(input);
    const entry = await requireOwnedRow<KhataEntry>(
      supabase,
      userId,
      "khata_entries",
      v.khata_entry_id,
      "id, amount"
    );

    const { data: pays } = await supabase
      .from("khata_payments")
      .select("amount")
      .eq("user_id", userId)
      .eq("khata_entry_id", v.khata_entry_id);
    const paid = (pays ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
    const remaining = Number(entry.amount) - paid;

    if (v.amount > remaining + 0.001) {
      throw new ActionError(
        `That is more than the ${remaining.toFixed(2)} still outstanding.`
      );
    }

    const { data, error } = await supabase
      .from("khata_payments")
      .insert({
        user_id: userId,
        khata_entry_id: v.khata_entry_id,
        amount: v.amount,
        paid_at: v.paid_at ?? new Date().toISOString(),
        note: v.note,
      })
      .select("id")
      .single();
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateKhata();
    return { id: (data as { id: string }).id };
  });
}

export async function deleteKhataPayment(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("khata_payments")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateKhata();
    return undefined as never;
  });
}

/** Settle the whole remaining balance in one tap. */
export async function settleKhataEntry(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const entry = await requireOwnedRow<KhataEntry>(
      supabase,
      userId,
      "khata_entries",
      id,
      "id, amount"
    );
    const { data: pays } = await supabase
      .from("khata_payments")
      .select("amount")
      .eq("user_id", userId)
      .eq("khata_entry_id", id);
    const paid = (pays ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
    const remaining = Number(entry.amount) - paid;

    if (remaining > 0.001) {
      const { error } = await supabase.from("khata_payments").insert({
        user_id: userId,
        khata_entry_id: id,
        amount: remaining,
        paid_at: new Date().toISOString(),
        note: "Settled in full",
      });
      if (error) throw new ActionError(friendlyDbError(error.message));
    }
    revalidateKhata();
    return undefined as never;
  });
}

export async function deleteKhataPerson(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    await assertOwned(supabase, userId, "khata_people", [id]);
    const { error } = await supabase
      .from("khata_people")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));
    revalidateKhata();
    return undefined as never;
  });
}
