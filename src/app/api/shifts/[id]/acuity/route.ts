import { db } from "@/db";
import { shift, shiftDefinition } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";
import { describeStaffing } from "@/lib/audit/staffing-context";

/**
 * Update shift acuity level, census, and extra staff requirements
 * POST /api/shifts/[id]/acuity
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.select().from(shift).where(eq(shift.id, id)).get();

  if (!existing) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  // Build update object
  const updateData: Record<string, unknown> = {};

  if (body.acuityLevel !== undefined) {
    updateData.acuityLevel = body.acuityLevel;
    // When a census tier is set via censusBandId, the band's staffing spec is absolute —
    // clear the extra-staff modifier to prevent double-counting.
    updateData.acuityExtraStaff = body.censusBandId
      ? 0
      : (body.acuityExtraStaff ?? 0);
  }

  if (body.censusBandId !== undefined) {
    updateData.censusBandId = body.censusBandId;
  }

  if (body.sitterCount !== undefined) {
    updateData.sitterCount = body.sitterCount;
  }

  if (body.actualCensus !== undefined) {
    updateData.actualCensus = body.actualCensus;
  }

  const updated = db
    .update(shift)
    .set(updateData)
    .where(eq(shift.id, id))
    .returning()
    .get();

  // Look up shift definition for a readable description (unit + shift type)
  const shiftDef = db
    .select({
      name: shiftDefinition.name,
      shiftType: shiftDefinition.shiftType,
      unit: shiftDefinition.unit,
    })
    .from(shiftDefinition)
    .where(eq(shiftDefinition.id, existing.shiftDefinitionId))
    .get();
  const shiftLabel = shiftDef
    ? `${shiftDef.name} (${shiftDef.unit}) on ${existing.date}`
    : `shift on ${existing.date}`;

  // Staffing position AFTER the update — this is what makes the entry useful to
  // someone reading the trail later: it names the excess (or shortfall) the
  // census change just created, so a subsequent send-home has visible cause.
  const staffingNote = describeStaffing(id);

  const tierChanged =
    body.acuityLevel !== undefined && existing.acuityLevel !== body.acuityLevel;
  const bandChanged =
    body.censusBandId !== undefined &&
    existing.censusBandId !== body.censusBandId;

  if (tierChanged || bandChanged) {
    const fromTier = existing.acuityLevel ?? "none";
    const toTier = body.acuityLevel ?? existing.acuityLevel ?? "none";
    logAuditEvent({
      entityType: "shift",
      entityId: id,
      action: "acuity_changed",
      description: `Census tier changed from ${fromTier} to ${toTier} for ${shiftLabel}${staffingNote}`,
      previousState: {
        acuityLevel: existing.acuityLevel,
        censusBandId: existing.censusBandId,
      },
      newState: {
        acuityLevel: body.acuityLevel ?? existing.acuityLevel,
        censusBandId: body.censusBandId ?? existing.censusBandId,
      },
      performedBy: body.performedBy ?? "nurse_manager",
    });
  }

  if (
    body.actualCensus !== undefined &&
    existing.actualCensus !== body.actualCensus
  ) {
    logAuditEvent({
      entityType: "shift",
      entityId: id,
      action: "census_changed",
      description: `Patient census changed from ${existing.actualCensus ?? "not set"} to ${body.actualCensus} for ${shiftLabel}${staffingNote}`,
      previousState: { actualCensus: existing.actualCensus },
      newState: { actualCensus: body.actualCensus },
      performedBy: body.performedBy ?? "nurse_manager",
    });
  }

  return NextResponse.json(updated);
}
