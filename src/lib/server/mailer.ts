import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

// ============================================================================
// Outbound email, sent by this app through Gmail's SMTP relay.
//
// Supabase's own mailer is deliberately bypassed: the auth actions ask it to
// GENERATE a confirmation link and then hand that link to this module, so the
// message the user receives comes from the project's own mailbox rather than
// from Supabase.
//
// GMAIL_APP_PASSWORD is a Google App Password, not an account password. Google
// prints it as four blocks of four for readability; the spaces are cosmetic and
// are stripped here so a pasted value works either way.
// ============================================================================

const HOST = "smtp.gmail.com";
const PORT = 465; // implicit TLS

let cached: Transporter | null = null;

function credentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

/** True when the mailbox is configured; lets callers degrade with a clear message. */
export function mailerConfigured(): boolean {
  return credentials() !== null;
}

function transport(): Transporter | null {
  if (cached) return cached;
  const auth = credentials();
  if (!auth) return null;
  cached = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: true,
    auth,
  });
  return cached;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailResult {
  ok: boolean;
  error?: string;
}

/**
 * Gmail rewrites the From header to the authenticated account regardless of
 * what is passed, so the display name is the only part worth setting.
 */
function fromHeader(user: string): string {
  const name = process.env.MAIL_FROM_NAME?.trim() || "Khata";
  return `"${name}" <${user}>`;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const auth = credentials();
  const tx = transport();
  if (!auth || !tx) {
    return {
      ok: false,
      error:
        "Email is not configured yet. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment.",
    };
  }

  try {
    await tx.sendMail({
      from: fromHeader(auth.user),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { ok: true };
  } catch (err) {
    // Never surface SMTP internals to the browser — they name the mailbox and
    // can distinguish "no such recipient" from "bad credentials".
    console.error("[mail]", err);
    return { ok: false, error: "The email could not be sent. Please try again." };
  }
}

/** Verifies the SMTP credentials without sending anything. */
export async function verifyMailer(): Promise<MailResult> {
  const tx = transport();
  if (!tx) return { ok: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD are not set." };
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
