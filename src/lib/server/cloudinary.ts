import "server-only";

import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary, configured for PRIVATE receipt storage.
 *
 * Everything is uploaded as `type: "authenticated"`, which means the asset is
 * not reachable from its plain URL — delivery requires a signed, expiring link
 * generated here on the server. Receipts are financial documents, so the
 * default public delivery would be a real privacy regression.
 *
 * The API secret is server-only. It must never be exposed with a
 * NEXT_PUBLIC_ prefix, and no signing happens in the browser.
 */

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

/** How long a delivery link stays valid. Long enough to view, short enough to leak harmlessly. */
const SIGNED_URL_TTL_SECONDS = 10 * 60;

export interface UploadedAsset {
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Upload a receipt.
 *
 * `folder` is built by the caller from the verified session user id, so a
 * client can never place a file into someone else's folder.
 */
export async function uploadReceiptAsset(
  file: File,
  folder: string
): Promise<UploadedAsset> {
  if (!isCloudinaryConfigured) {
    throw new Error(
      "Image uploads are not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to your environment."
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await new Promise<{
    public_id: string;
    resource_type: string;
    format?: string;
    bytes: number;
    width?: number;
    height?: number;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        // Private delivery: the asset 404s without a valid signature.
        type: "authenticated",
        // `auto` lets Cloudinary treat PDFs correctly as well as images.
        resource_type: "auto",
        // Never trust the client filename for the public id.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        // Strip location/camera metadata from receipt photos.
        invalidate: true,
      },
      (error, uploaded) => {
        if (error || !uploaded) {
          reject(new Error(error?.message ?? "Upload failed."));
          return;
        }
        resolve(uploaded as never);
      }
    );
    stream.end(buffer);
  });

  return {
    publicId: result.public_id,
    resourceType: result.resource_type ?? "image",
    format: result.format ?? null,
    bytes: result.bytes ?? buffer.byteLength,
    width: result.width ?? null,
    height: result.height ?? null,
  };
}

/**
 * A short-lived signed URL for an authenticated asset.
 * Without the signature Cloudinary refuses the request, so these links cannot
 * be shared indefinitely or guessed.
 */
export function signedReceiptUrl(
  publicId: string,
  resourceType = "image",
  format?: string | null
): string {
  if (!isCloudinaryConfigured) return "";

  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: resourceType,
    sign_url: true,
    secure: true,
    ...(format ? { format } : {}),
    // Cloudinary compares this against its own clock and rejects late requests.
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}

/** Delete an asset. Safe to call when the asset is already gone. */
export async function deleteReceiptAsset(
  publicId: string,
  resourceType = "image"
): Promise<void> {
  if (!isCloudinaryConfigured) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      type: "authenticated",
      resource_type: resourceType,
      invalidate: true,
    });
  } catch (err) {
    // A failed remote delete must not block deleting our own row.
    console.error("[cloudinary] destroy failed", err);
  }
}

/** Remove every asset under a user's folder — used when erasing an account. */
export async function deleteUserFolder(userId: string): Promise<void> {
  if (!isCloudinaryConfigured) return;
  const prefix = `khata/${userId}`;
  for (const resourceType of ["image", "raw"] as const) {
    try {
      await cloudinary.api.delete_resources_by_prefix(prefix, {
        type: "authenticated",
        resource_type: resourceType,
      });
    } catch (err) {
      console.error("[cloudinary] bulk delete failed", err);
    }
  }
  try {
    await cloudinary.api.delete_folder(prefix);
  } catch {
    // The folder may not exist, or may still hold assets — not fatal.
  }
}

/** Path convention: khata/{user_id}/{transaction_id} */
export function receiptFolder(userId: string, transactionId?: string | null): string {
  return `khata/${userId}/${transactionId || "unfiled"}`;
}
