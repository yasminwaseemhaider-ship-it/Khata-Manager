import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Receipt OCR.
 *
 * POST a receipt image; get back the extracted text plus a BEST-GUESS draft
 * (total, date, vendor). The draft is a suggestion only — the client must show
 * it for confirmation, and no transaction is created here. This route never
 * writes to the database.
 *
 * Uses OCR.space when OCR_API_KEY is set. Without a key it returns 501 and the
 * UI falls back to manual entry rather than pretending to work.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // OCR.space free tier limit
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

interface OcrDraft {
  amount: number | null;
  date: string | null;
  vendor: string | null;
  lineItems: { name: string; amount: number }[];
}

/** Money-looking token, tolerant of thousands separators and currency marks. */
const MONEY = /(?:rs\.?|pkr|₨|\$)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;

const TOTAL_HINTS = [
  "grand total", "net total", "net payable", "total payable", "amount payable",
  "total amount", "bill total", "total", "net amt", "payable", "cash paid",
];
const IGNORE_HINTS = ["subtotal", "sub total", "tax", "gst", "discount", "change", "return"];

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pick the bill total. Prefers a line explicitly labelled "total" (ignoring
 * subtotal/tax lines); otherwise falls back to the largest money value seen,
 * which on a receipt is almost always the total.
 */
function extractTotal(lines: string[]): number | null {
  let labelled: number | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (IGNORE_HINTS.some((h) => lower.includes(h))) continue;
    if (!TOTAL_HINTS.some((h) => lower.includes(h))) continue;

    // Take the last money token on the line — receipts put the figure last.
    const matches = [...line.matchAll(new RegExp(MONEY, "gi"))];
    const last = matches[matches.length - 1]?.[1];
    if (last) {
      const value = toNumber(last);
      if (value !== null && (labelled === null || value > labelled)) labelled = value;
    }
  }
  if (labelled !== null) return labelled;

  let largest: number | null = null;
  for (const line of lines) {
    for (const m of line.matchAll(new RegExp(MONEY, "gi"))) {
      const value = toNumber(m[1]);
      if (value !== null && (largest === null || value > largest)) largest = value;
    }
  }
  return largest;
}

/** Find a date in the usual receipt formats; returns yyyy-mm-dd. */
function extractDate(text: string): string | null {
  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const yearRaw = Number(dmy[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day, 12);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  const ymd = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (ymd) {
    return `${ymd[1]}-${String(Number(ymd[2])).padStart(2, "0")}-${String(
      Number(ymd[3])
    ).padStart(2, "0")}`;
  }
  return null;
}

/**
 * The shop name is nearly always in the first couple of printed lines.
 * Skip lines that are mostly digits/punctuation (addresses, phone numbers).
 */
function extractVendor(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/[^A-Za-z\s&'.-]/g, "").trim();
    if (clean.length < 3 || clean.length > 40) continue;
    const letters = (clean.match(/[A-Za-z]/g) ?? []).length;
    if (letters / clean.length < 0.6) continue;
    if (/receipt|invoice|bill|tax|welcome|thank/i.test(clean)) continue;
    return clean.replace(/\s{2,}/g, " ");
  }
  return null;
}

function extractLineItems(lines: string[]): { name: string; amount: number }[] {
  const items: { name: string; amount: number }[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (TOTAL_HINTS.some((h) => lower.includes(h))) continue;
    if (IGNORE_HINTS.some((h) => lower.includes(h))) continue;

    const matches = [...line.matchAll(new RegExp(MONEY, "gi"))];
    if (matches.length === 0) continue;
    const amount = toNumber(matches[matches.length - 1][1]);
    if (amount === null) continue;

    const name = line
      .slice(0, matches[matches.length - 1].index ?? line.length)
      .replace(/[^A-Za-z0-9\s&'.-]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (name.length < 2 || name.length > 40) continue;

    items.push({ name, amount });
    if (items.length >= 15) break;
  }
  return items;
}

export async function POST(request: Request) {
  // Authenticated users only — this endpoint costs money to run.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const apiKey = process.env.OCR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Receipt scanning is not configured. Add OCR_API_KEY to your environment, or enter the amount by hand.",
      },
      { status: 501 }
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Attach a receipt image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That image is larger than 5 MB. Try a smaller photo." },
      { status: 413 }
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Upload a JPG, PNG, WebP or PDF." },
      { status: 415 }
    );
  }

  try {
    const upstream = new FormData();
    upstream.set("file", file, file.name || "receipt.jpg");
    upstream.set("language", "eng");
    upstream.set("isTable", "true");
    upstream.set("scale", "true");
    upstream.set("OCREngine", "2");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: upstream,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: "The scanning service is unavailable right now." },
        { status: 502 }
      );
    }

    const json = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: { ParsedText?: string }[];
    };

    if (json.IsErroredOnProcessing) {
      const msg = Array.isArray(json.ErrorMessage)
        ? json.ErrorMessage.join(" ")
        : json.ErrorMessage;
      return NextResponse.json(
        { error: msg || "Could not read that receipt." },
        { status: 422 }
      );
    }

    const text = json.ParsedResults?.[0]?.ParsedText ?? "";
    if (!text.trim()) {
      return NextResponse.json(
        { error: "No text found. Try a clearer, straighter photo." },
        { status: 422 }
      );
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const draft: OcrDraft = {
      amount: extractTotal(lines),
      date: extractDate(text),
      vendor: extractVendor(lines),
      lineItems: extractLineItems(lines),
    };

    // Suggestion only. The client MUST confirm before saving anything.
    return NextResponse.json({ text, draft, requiresConfirmation: true });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Scanning took too long. Try a smaller image." },
        { status: 504 }
      );
    }
    console.error("[ocr]", err);
    return NextResponse.json({ error: "Could not scan that receipt." }, { status: 500 });
  }
}
