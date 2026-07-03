import { db } from "@/db";
import { user } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import {
  signSession,
  sessionCookieAttributes,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";

// Node runtime (uses node:crypto via password.ts + better-sqlite3 via db).
export const runtime = "nodejs";

const GENERIC_ERROR = "Invalid credentials";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Look up an active user by email.
  const account =
    email.length > 0
      ? db
          .select()
          .from(user)
          .where(and(eq(user.email, email), eq(user.isActive, true)))
          .get()
      : undefined;

  // Always run a verify to keep timing/response shape uniform whether or not the
  // account exists. When there is no account, verify against a throwaway hash.
  const storedHash =
    account?.passwordHash ??
    "00000000000000000000000000000000:" + "0".repeat(128);
  const ok = verifyPassword(password, storedHash);

  if (!account || !ok) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const token = await signSession({
    uid: account.id,
    role: account.role,
    staffId: account.staffId ?? null,
    exp: Date.now() + SESSION_DURATION_MS,
  });

  const response = NextResponse.json({ role: account.role });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}${sessionCookieAttributes(
      SESSION_MAX_AGE_SECONDS
    )}`
  );
  return response;
}
