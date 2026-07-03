import { db } from "@/db";
import { notification } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Nurse-facing notifications. Identity comes from the x-staff-id header the
 * middleware attaches. When AUTH_ENABLED is off the header is absent — the
 * `staffId` query param is accepted as a dev fallback so the surface still works
 * in open mode. A nurse only ever sees their own notifications.
 */
function resolveStaffId(request: Request): string | null {
  const role = request.headers.get("x-user-role");
  const headerStaffId = request.headers.get("x-staff-id");
  if (role === "nurse" && headerStaffId) return headerStaffId;
  // AUTH off / manager preview: allow an explicit staffId hint.
  const { searchParams } = new URL(request.url);
  return headerStaffId ?? searchParams.get("staffId");
}

// GET — latest 50 notifications for the caller + unread count.
export async function GET(request: Request) {
  const staffId = resolveStaffId(request);
  if (!staffId) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const notifications = db
    .select()
    .from(notification)
    .where(eq(notification.staffId, staffId))
    .orderBy(desc(notification.createdAt))
    .limit(50)
    .all();

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  return NextResponse.json({ notifications, unreadCount });
}

// PUT — { action: "mark-all-read" } sets readAt=now on the caller's unread rows.
export async function PUT(request: Request) {
  const staffId = resolveStaffId(request);
  if (!staffId) {
    return NextResponse.json({ error: "No staff identity" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "mark-all-read") {
    return NextResponse.json(
      { error: "Unsupported action" },
      { status: 400 }
    );
  }

  db.update(notification)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notification.staffId, staffId), isNull(notification.readAt)))
    .run();

  return NextResponse.json({ success: true });
}
