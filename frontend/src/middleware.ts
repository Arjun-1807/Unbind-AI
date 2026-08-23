import { NextResponse, type NextRequest } from "next/server";

/**
 * Session cookie set by the backend (`COOKIE_NAME` in backend/app/config.py).
 * httpOnly, so this middleware is the only place the app can see it at all.
 */
const SESSION_COOKIE = "unbind_token";

/**
 * Send signed-in visitors from the landing page to their dashboard, on the
 * server.
 *
 * The client-side guard in `app/page.tsx` cannot do this job on its own. It has
 * to wait for `/auth/me` before it knows who the visitor is, so the first paint
 * for *everyone* — including Googlebot and every social-link scraper — is a
 * loader, not the marketing page. That is the worst possible thing to serve on
 * the one route whose entire purpose is being found and read.
 *
 * Checking the cookie here splits the two cases before rendering: a request
 * with no session gets the real landing HTML immediately, and a request with
 * one is redirected without ever painting.
 *
 * Cookie *presence* is not proof of validity — an expired or forged token still
 * looks like a cookie from here, and this middleware deliberately does not
 * verify it (that would need the JWT secret in the edge runtime). It is a
 * routing hint only. `/dashboard` still runs the real check and bounces back if
 * the session doesn't hold up, and the client guard in `page.tsx` stays as the
 * authority. Nothing is authorized here; the worst case is one wasted redirect.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Only the landing page. Every other route either needs no redirect or is
  // guarded client-side against the real session rather than a cookie's
  // existence.
  matcher: ["/"],
};
