import { db } from "@/db";
import { user, staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySession,
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from "@/lib/auth/session";

export const runtime = "nodejs";

interface Identity {
  uid: string;
  role: "manager" | "nurse";
  staffId: string | null;
}

/**
 * Resolve the caller. Prefer the identity headers the middleware attached (auth
 * on); otherwise verify the cookie directly (covers direct calls and lets /me
 * work even though the auth API is excluded from the middleware matcher).
 */
async function resolveIdentity(request: Request): Promise<Identity | null> {
  const headerUid = request.headers.get("x-user-id");
  const headerRole = request.headers.get("x-user-role");
  if (headerUid && (headerRole === "manager" || headerRole === "nurse")) {
    return {
      uid: headerUid,
      role: headerRole,
      staffId: request.headers.get("x-staff-id"),
    };
  }

  const token = (await cookies()).get("ssai_session")?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  return { uid: payload.uid, role: payload.role, staffId: payload.staffId };
}

export async function GET(request: Request) {
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const account = db.select().from(user).where(eq(user.id, identity.uid)).get();
  if (!account || !account.isActive) {
    // Valid signature but the account is gone or deactivated (e.g. a re-import
    // cascade-deleted a nurse login). The stateless middleware would keep
    // honoring this cookie for up to 30 days — destroy it so the client falls
    // cleanly back to the login flow instead of a half-authenticated limbo.
    const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    res.headers.set(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; ${sessionCookieAttributes(0)}`
    );
    return res;
  }

  let name = "Manager";
  if (account.role === "nurse" && account.staffId) {
    const staffRecord = db
      .select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(eq(staff.id, account.staffId))
      .get();
    if (staffRecord) {
      name = `${staffRecord.firstName} ${staffRecord.lastName}`;
    }
  }

  return NextResponse.json({
    id: account.id,
    email: account.email,
    role: account.role,
    staffId: account.staffId ?? null,
    name,
  });
}
