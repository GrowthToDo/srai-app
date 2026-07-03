import { NextResponse } from "next/server";
import {
  sessionCookieAttributes,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear the cookie by expiring it (Max-Age=0), reusing the same attributes so
  // the browser matches and drops it.
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${sessionCookieAttributes(0)}`
  );
  return response;
}
