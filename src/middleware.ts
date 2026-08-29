import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Pages that a signed-OUT visitor may see. A signed-IN visitor is bounced away
 * from these to the dashboard…
 */
const AUTH_PATHS = ["/login", "/signup", "/forgot-password"];

/**
 * …except these. Supabase signs the user in as part of the recovery link, so
 * `/reset-password` is reached *while authenticated*. Treating it like the
 * other auth pages redirected the user to the dashboard and made the reset
 * form unreachable.
 */
const ALWAYS_ALLOWED = ["/reset-password", "/auth", "/api/auth", "/api/ocr"];

/** Everything below here requires a session. */
const PROTECTED_PREFIXES = [
  "/dashboard", "/transactions", "/daily", "/monthly", "/yearly", "/calendar",
  "/income", "/accounts", "/budgets", "/recurring", "/shopping", "/khata",
  "/reports", "/insights", "/reminders", "/vendors", "/tags", "/settings",
  "/onboarding",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the auth cookie as a side effect, keeping sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOWED.some((p) => pathname.startsWith(p))) {
    return response;
  }

  // A signed-in user has no reason to see the login or signup pages.
  if (user && AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed so login can send them back.
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

// Next 16 renamed this convention from `middleware` to `proxy`; the alias keeps
// both names working.
export const middleware = proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
