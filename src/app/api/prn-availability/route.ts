import { db } from "@/db";
import { prnAvailability, staff } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  PRN_TEMPLATE_SCHEDULE_ID,
  serializeAvailableDates,
} from "@/lib/prn-availability";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("scheduleId");
  const staffId = searchParams.get("staffId");

  const conditions = [];

  if (scheduleId) {
    conditions.push(eq(prnAvailability.scheduleId, scheduleId));
  }
  if (staffId) {
    conditions.push(eq(prnAvailability.staffId, staffId));
  }

  const query = db
    .select({
      id: prnAvailability.id,
      staffId: prnAvailability.staffId,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      scheduleId: prnAvailability.scheduleId,
      availableDates: prnAvailability.availableDates,
      notes: prnAvailability.notes,
      submittedAt: prnAvailability.submittedAt,
      createdAt: prnAvailability.createdAt,
    })
    .from(prnAvailability)
    .leftJoin(staff, eq(prnAvailability.staffId, staff.id));

  if (conditions.length > 0) {
    const results = query.where(and(...conditions)).all();
    return NextResponse.json(results);
  }

  return NextResponse.json(query.all());
}

export async function POST(request: Request) {
  const body = await request.json();

  // Ownership (mirrors POST /api/staff-leave): a nurse may only submit their
  // OWN availability — force staffId to the caller's identity. Managers (and
  // AUTH_ENABLED off) submit on behalf of any PRN nurse using body.staffId, so
  // the manager quick-entry dialog keeps working with no header override.
  const role = request.headers.get("x-user-role");
  const callerStaffId = request.headers.get("x-staff-id");
  const staffId =
    role === "nurse" && callerStaffId ? callerStaffId : body.staffId;

  if (!staffId) {
    return NextResponse.json({ error: "staffId is required" }, { status: 400 });
  }

  // Every PRN submission anchors to the shared template schedule (the rule
  // engine ignores scheduleId). UI callers omit it; only the Excel import sends
  // an explicit one. This keeps the (staffId, scheduleId) upsert stable so a
  // nurse always has exactly one availability row.
  const scheduleId = body.scheduleId ?? PRN_TEMPLATE_SCHEDULE_ID;
  const availableDates = serializeAvailableDates(body.availableDates ?? []);
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  // Check if entry already exists for this staff + schedule
  const existing = db
    .select()
    .from(prnAvailability)
    .where(
      and(
        eq(prnAvailability.staffId, staffId),
        eq(prnAvailability.scheduleId, scheduleId)
      )
    )
    .get();

  if (existing) {
    // Upsert: replace the caller's existing availability row in place.
    const updated = db
      .update(prnAvailability)
      .set({
        availableDates,
        notes,
        submittedAt: new Date().toISOString(),
      })
      .where(eq(prnAvailability.id, existing.id))
      .returning()
      .get();

    return NextResponse.json(updated);
  }

  // Create new
  const newAvailability = db
    .insert(prnAvailability)
    .values({
      staffId,
      scheduleId,
      availableDates,
      notes,
    })
    .returning()
    .get();

  return NextResponse.json(newAvailability, { status: 201 });
}
