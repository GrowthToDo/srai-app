import { db } from "@/db";
import { user, staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/session";

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
