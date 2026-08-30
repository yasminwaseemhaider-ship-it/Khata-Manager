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
  const { pathname } = request.nextUrl;

  // Decide whether this request needs an identity BEFORE asking for one.
  // `auth.getUser()` is a network round trip to Supabase — it verifies the JWT
  // rather than decoding a cookie locally. It used to run unconditionally at
  // the top of this function, so every exempt path paid for an answer it then
  // threw away.
  if (ALWAYS_ALLOWED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isAuthPath && !isProtected) {
    return NextResponse.next({ request });
  }

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

  // Refreshes the auth cookie as a side effect, keeping sessions alive. Every
  // real page of the app is covered by the two lists above, so sessions still
  // refresh on ordinary use.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-in user has no reason to see the login or signup pages.
  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed so login can send them back.
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      // Skip link prefetches. The sidebar renders ~19 links, so hover and
      // viewport prefetching turned one navigation into a fan-out of auth round
      // trips. Real navigations are still checked here, and every protected page
      // re-verifies server-side regardless, so a prefetch can never leak a
      // payload to a signed-out visitor.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
