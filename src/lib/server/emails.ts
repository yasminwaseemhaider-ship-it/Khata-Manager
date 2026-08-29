import "server-only";

import type { Mail } from "@/lib/server/mailer";

// ============================================================================
// Email templates.
//
// Written as inline-styled HTML with a plain-text twin, because mail clients
// strip <style> blocks and a good number of people read in plain text. Nothing
// here is loaded from a CDN: remote images are blocked by default in most
// clients and would only render as a broken box.
// ============================================================================

const BRAND = "#0f766e";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

/** Prevents a crafted display name from injecting markup into the message. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: {
  heading: string;
  body: string;
  cta: { label: string; href: string };
  footnote: string;
  link: string;
}): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    opts.heading
  )}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
          <tr>
            <td style="padding:28px 32px 0;">
              <div style="font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${BRAND};">
                Khata
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 32px 0;">
              <h1 style="margin:0;font:600 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
                ${escapeHtml(opts.heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;">
              <a href="${opts.cta.href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:10px;">
                ${escapeHtml(opts.cta.label)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${MUTED};">
              If the button does not work, copy this address into your browser:<br>
              <span style="color:${BRAND};word-break:break-all;">${opts.link}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 28px;border-top:1px solid ${LINE};margin-top:22px;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${MUTED};">
              ${escapeHtml(opts.footnote)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function confirmSignupEmail(to: string, link: string, name?: string | null): Mail {
  const greeting = name ? `Hello ${name},` : "Hello,";
  return {
    to,
    subject: "Confirm your email to start your khata",
    html: layout({
      heading: "Confirm your email",
      body: `<p style="margin:0 0 12px;">${escapeHtml(
        greeting
      )}</p><p style="margin:0;">Your khata is ready as soon as you confirm this address. The link works once and expires in 24 hours.</p>`,
      cta: { label: "Confirm email", href: link },
      link,
      footnote:
        "If you did not create a Khata account, ignore this message — nothing was set up and no further email will be sent.",
    }),
    text: `${greeting}

Your khata is ready as soon as you confirm this address.

Confirm your email:
${link}

The link works once and expires in 24 hours.

If you did not create a Khata account, ignore this message — nothing was set up.`,
  };
}

export function resetPasswordEmail(to: string, link: string): Mail {
  return {
    to,
    subject: "Reset your Khata password",
    html: layout({
      heading: "Set a new password",
      body: `<p style="margin:0;">Use the button below to choose a new password. The link works once and expires in one hour.</p>`,
      cta: { label: "Set a new password", href: link },
      link,
      footnote:
        "If you did not ask to reset your password, ignore this message — your current password still works and nothing has changed.",
    }),
    text: `Set a new password

Use this link to choose a new password:
${link}

The link works once and expires in one hour.

If you did not ask to reset your password, ignore this message — your current password still works.`,
  };
}
