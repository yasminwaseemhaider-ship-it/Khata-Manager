// ============================================================================
// Auth callback — the landing point for every link Supabase emails out.
//
// Supabase's verify endpoint hands control back here with ONE of two shapes,
// depending on which email template is in use:
//
//   ?code=<uuid>                 PKCE. Exchange it for a session.
//   ?token_hash=<hash>&type=...  The newer template style. Verify the OTP.
//
// Either way a session cookie has to be written before the user reaches a
// protected page, which is why this route exists at all: without it the link
// lands on /login carrying a code nothing ever redeems, and the user is bounced
// straight back to signing in — looking exactly like a link that "didn't work".
//
// `/auth` is already exempt in the proxy allow-list, so this runs signed out.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Only same-origin paths may be followed, so ?next= cannot bounce off-site. */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function failure(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));

  // Supabase reports its own failures (expired link, already used) as params.
  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) {
    return failure(request, errorDescription);
  }

  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure(request, error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return failure(request, error.message);
  } else {
    return failure(request, "That link is missing its confirmation code.");
  }

  const url = request.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  return NextResponse.redirect(url);
}
