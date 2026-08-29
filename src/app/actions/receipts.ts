"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/session";
import { requireOwnedRow, run, ActionError, friendlyDbError } from "@/lib/server/guards";
import {
  uploadReceiptAsset,
  signedReceiptUrl,
  deleteReceiptAsset,
  receiptFolder,
  isCloudinaryConfigured,
} from "@/lib/server/cloudinary";
import type { ActionResult, Receipt } from "@/types";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/**
 * Upload a receipt to Cloudinary and record it.
 *
 * The folder is derived server-side from the verified session user id, so a
 * client cannot write into another user's folder. Assets are uploaded as
 * `authenticated`, so they are never publicly reachable — see
 * `src/lib/server/cloudinary.ts`.
 */
export async function uploadReceipt(
  formData: FormData
): Promise<ActionResult<{ id: string; publicId: string }>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();

    if (!isCloudinaryConfigured) {
      throw new ActionError(
        "Image uploads are not configured yet. Add your Cloudinary keys to .env.local."
      );
    }

    const transactionId = String(formData.get("transaction_id") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ActionError("Choose a receipt image to upload.");
    }
    if (file.size > MAX_BYTES) {
      throw new ActionError("That file is larger than 10 MB.");
    }
    if (!ALLOWED.has(file.type)) {
      throw new ActionError("Upload a JPG, PNG, WebP, HEIC or PDF.");
    }
    if (transactionId) {
      await requireOwnedRow(supabase, userId, "transactions", transactionId, "id");
    }

    const asset = await uploadReceiptAsset(file, receiptFolder(userId, transactionId));

    const { data, error } = await supabase
      .from("receipts")
      .insert({
        user_id: userId,
        transaction_id: transactionId || null,
        provider: "cloudinary",
        public_id: asset.publicId,
        resource_type: asset.resourceType,
        storage_path: asset.publicId, // legacy column, kept in sync
        display_name: file.name.slice(0, 120),
        mime_type: file.type,
        size_bytes: asset.bytes,
        format: asset.format,
      })
      .select("id")
      .single();

    if (error) {
      // Don't strand an orphan asset in Cloudinary if the row insert failed.
      await deleteReceiptAsset(asset.publicId, asset.resourceType);
      throw new ActionError(friendlyDbError(error.message));
    }

    revalidatePath("/transactions");
    return { id: (data as { id: string }).id, publicId: asset.publicId };
  });
}

/** Short-lived signed URLs. Assets are private, so nothing is publicly viewable. */
export async function getReceiptUrls(
  transactionId: string
): Promise<ActionResult<{ id: string; url: string; name: string; mime: string }[]>> {
  return run(async () => {
    const { supabase, userId } = await requireUser();

    const { data: rows } = await supabase
      .from("receipts")
      .select("id, public_id, storage_path, resource_type, format, display_name, mime_type")
      .eq("user_id", userId)
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    return ((rows ?? []) as Receipt[])
      .map((r) => {
        const publicId = r.public_id ?? r.storage_path;
        if (!publicId) return null;
        const url = signedReceiptUrl(publicId, r.resource_type ?? "image", r.format);
        if (!url) return null;
        return {
          id: r.id,
          url,
          name: r.display_name ?? "Receipt",
          mime: r.mime_type ?? "image/jpeg",
        };
      })
      .filter((x): x is { id: string; url: string; name: string; mime: string } => x !== null);
  });
}

export async function deleteReceipt(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, userId } = await requireUser();
    const row = await requireOwnedRow<Receipt>(supabase, userId, "receipts", id);

    const publicId = row.public_id ?? row.storage_path;
    if (publicId) {
      await deleteReceiptAsset(publicId, row.resource_type ?? "image");
    }

    const { error } = await supabase
      .from("receipts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new ActionError(friendlyDbError(error.message));

    revalidatePath("/transactions");
    return undefined as never;
  });
}
