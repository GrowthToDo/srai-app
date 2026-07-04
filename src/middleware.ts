import { NextResponse, type NextRequest } from "next/server";
import {
  verifySession,
  signSession,
  shouldReissue,
  sessionCookieAttributes,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";
import { authorize } from "@/lib/auth/roles";

// EDGE-PURITY: this module and its imports (session.ts, roles.ts) must contain
// NO node:crypto, NO Buffer, NO "@/db". Do not add server-only imports here.

// --- Startup guardrails (module scope; evaluated once when the Edge bundle loads) ---
if (
  process.env.NODE_ENV === "production" &&
  process.env.AUTH_ENABLED === "true" &&
  !process.env.AUTH_SECRET
) {
  throw new Error(
    "AUTH_SECRET is required when AUTH_ENABLED=true in production. Set it in the environment before starting.",
  );
}
if (
  process.env.NODE_ENV === "production" &&
  process.env.DEMO_PREFILL === "true"
) {
  console.warn(
    "\n" +
      "============================================================\n" +
      "  WARNING: DEMO_PREFILL=true in PRODUCTION.\n" +
      "  The login page will pre-fill demo nurse credentials and\n" +
      "  expose a shared demo account. Disable for a real launch.\n" +
      "============================================================\n",
  );
}

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

// AUTH_SCOPE=nurse_only: manager surfaces are directly reachable (no login),
// only the nurse portal (/my*, /api/my*) stays enforced. Any other value
// (including unset) is "all" — today's fully-gated behavior, unchanged. Only
// meaningful when AUTH_ENABLED is true; local/demo use only (see DEMO-LOGINS.md).
const AUTH_SCOPE =
  process.env.AUTH_SCOPE === "nurse_only" ? "nurse_only" : "all";

function unauthorizedJson(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function forbiddenJson(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** True for the nurse portal surface: /my, /my/*, /api/my, /api/my/*. */
function isNurseSurface(pathname: string): boolean {
  return (
    pathname === "/my" ||
    pathname.startsWith("/my/") ||
    pathname === "/api/my" ||
    pathname.startsWith("/api/my/")
  );
}

export async function middleware(request: NextRequest) {
  // Total no-op when auth is disabled (default; local dev without an env file).
  if (!AUTH_ENABLED) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const method = request.method;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySession(token);

  // Invalid / missing session.
  if (!payload) {
    // Demo/local mode: manager surfaces are open with no login; only the
    // nurse portal stays enforced. Anonymous requests must not be able to
    // spoof identity headers, so strip any incoming ones before passing
    // through — the enforced (nurse) path below is the only one allowed to
    // set them.
    if (AUTH_SCOPE === "nurse_only" && !isNurseSurface(pathname)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.delete("x-user-id");
      requestHeaders.delete("x-user-role");
      requestHeaders.delete("x-staff-id");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (isApiPath(pathname)) return unauthorizedJson();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authorize the route for the role.
  const decision = authorize(pathname, method, payload.role);
  if (decision === "deny") {
    if (isApiPath(pathname)) return forbiddenJson();
    // Send the user back to their home surface rather than a dead end.
    const home = payload.role === "manager" ? "/" : "/my";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Allowed: forward identity to handlers via request headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.uid);
  requestHeaders.set("x-user-role", payload.role);
  if (payload.staffId) {
    requestHeaders.set("x-staff-id", payload.staffId);
  } else {
    requestHeaders.delete("x-staff-id");
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Rolling re-issue: refresh the cookie once it is older than ~1 day.
  if (shouldReissue(payload)) {
    const refreshed = await signSession({
      ...payload,
      exp: Date.now() + SESSION_DURATION_MS,
    });
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${refreshed}${sessionCookieAttributes(
        SESSION_MAX_AGE_SECONDS,
      )}`,
    );
  }

  return response;
}

export const config = {
  // Exclude the login page, the auth API (public), Next internals, and static
  // assets. Everything else runs through the middleware.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|manifest.json|icons/).*)",
  ],
};
