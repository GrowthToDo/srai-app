"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordAvailabilityDialog } from "@/components/prn-availability/record-availability-dialog";
import { toIsoDate } from "@/lib/prn-availability";
import { StaffCalendar } from "./staff-calendar";

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  employmentType: string;
  fte: number;
  icuCompetencyLevel: number;
  isChargeNurseQualified: boolean;
  homeUnit: string | null;
  isActive: boolean;
}

interface StaffPreferences {
  preferredShift: string | null;
  maxHoursPerWeek: number;
  maxConsecutiveDays: number;
  preferredDaysOff: string[];
  avoidWeekends: boolean;
  notes: string | null;
}

interface StaffAvailability {
  staffId: string;
  availableDates: string[];
  notes: string | null;
}

interface StaffDetailDialogProps {
  open: boolean;
  onClose: () => void;
  staff: Staff | null;
}

const employmentLabels: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  per_diem: "Per Diem",
  float: "Float",
  agency: "Agency",
};

const shiftLabels: Record<string, string> = {
  day: "Day Shift",
  night: "Night Shift",
  evening: "Evening Shift",
  any: "Any Shift",
};

export function StaffDetailDialog({
  open,
  onClose,
  staff,
}: StaffDetailDialogProps) {
  const [preferences, setPreferences] = useState<StaffPreferences | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  // PRN availability summary (per_diem staff only).
  const [availability, setAvailability] = useState<StaffAvailability | null>(
    null
  );
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const staffId = staff?.id ?? null;
  const isPerDiem = staff?.employmentType === "per_diem";

  const fetchAvailability = useCallback(async () => {
    if (!staffId) return;
    setLoadingAvailability(true);
    try {
      const res = await fetch("/api/prn-availability");
      const data: StaffAvailability[] = await res.json();
      const mine = Array.isArray(data)
        ? (data.find((a) => a.staffId === staffId) ?? null)
        : null;
      setAvailability(mine);
    } catch {
      setAvailability(null);
    }
    setLoadingAvailability(false);
  }, [staffId]);

  useEffect(() => {
    if (open && staff) {
      setLoadingPrefs(true);
      fetch(`/api/staff-preferences/${staff.id}`)
        .then((r) => r.json())
        .then((data) => {
          setPreferences(data);
          setLoadingPrefs(false);
        })
        .catch(() => {
          setPreferences(null);
          setLoadingPrefs(false);
        });
    }
  }, [open, staff]);

  useEffect(() => {
    if (open && isPerDiem) {
      fetchAvailability();
    } else {
      setAvailability(null);
    }
  }, [open, isPerDiem, fetchAvailability]);

  if (!staff) return null;

  // Next upcoming available day (dates are stored sorted ascending).
  const todayIso = toIsoDate(new Date());
  const availableDates = availability?.availableDates ?? [];
  const nextAvailable = availableDates.find((d) => d >= todayIso) ?? null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {staff.firstName} {staff.lastName}
            <Badge variant={staff.role === "RN" ? "default" : staff.role === "LPN" ? "outline" : "secondary"}>
              {staff.role}
            </Badge>
            {!staff.isActive && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Staff info summary */}
        <div className="mb-4 grid grid-cols-4 gap-4 rounded-lg border p-3 text-sm">
          <div>
            <p className="text-muted-foreground">Employment</p>
            <p className="font-medium">{employmentLabels[staff.employmentType] || staff.employmentType}</p>
          </div>
          <div>
            <p className="text-muted-foreground">FTE</p>
            <p className="font-medium">{staff.fte}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Home Unit</p>
            <p className="font-medium">{staff.homeUnit || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">ICU Level</p>
            <p className="font-medium">{staff.icuCompetencyLevel}/5</p>
          </div>
          <div>
            <p className="text-muted-foreground">Charge RN</p>
            <p className="font-medium">{staff.isChargeNurseQualified ? "Yes" : "No"}</p>
          </div>
        </div>

        {/* Shift Preferences */}
        <div className="mb-4">
          <h3 className="mb-2 font-medium">Shift Preferences</h3>
          {loadingPrefs ? (
            <p className="text-sm text-muted-foreground">Loading preferences...</p>
          ) : preferences ? (
            <div className="grid grid-cols-3 gap-4 rounded-lg border p-3 text-sm">
              <div>
                <p className="text-muted-foreground">Preferred Shift</p>
                <p className="font-medium">
                  {preferences.preferredShift
                    ? shiftLabels[preferences.preferredShift] || preferences.preferredShift
                    : "Any"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Max Hours/Week</p>
                <p className="font-medium">{preferences.maxHoursPerWeek}h</p>
              </div>
              <div>
                <p className="text-muted-foreground">Max Consecutive Days</p>
                <p className="font-medium">{preferences.maxConsecutiveDays} days</p>
              </div>
              <div>
                <p className="text-muted-foreground">Avoid Weekends</p>
                <p className="font-medium">{preferences.avoidWeekends ? "Yes" : "No"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Preferred Days Off</p>
                <p className="font-medium">
                  {preferences.preferredDaysOff?.length > 0
                    ? preferences.preferredDaysOff.join(", ")
                    : "None specified"}
                </p>
              </div>
              {preferences.notes && (
                <div className="col-span-3">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{preferences.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-lg border p-3">
              No preferences set for this staff member.
            </p>
          )}
        </div>

        {/* PRN availability (per diem staff only) */}
        {isPerDiem && (
          <div className="mb-4">
            <h3 className="mb-2 font-medium">Availability</h3>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              {loadingAvailability ? (
                <p className="text-muted-foreground">
                  Loading availability...
                </p>
              ) : availableDates.length > 0 ? (
                <p>
                  <span className="font-medium">
                    {availableDates.length} day
                    {availableDates.length === 1 ? "" : "s"} on file
                  </span>
                  {nextAvailable && (
                    <span className="text-muted-foreground">
                      {" "}
                      (next:{" "}
                      {format(
                        new Date(nextAvailable + "T00:00:00"),
                        "EEE MMM d"
                      )}
                      )
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No availability on file
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRecordOpen(true)}
              >
                <CalendarPlus className="size-3.5" />
                Record availability
              </Button>
            </div>
          </div>
        )}

        {/* Calendar */}
        <div>
          <h3 className="mb-2 font-medium">Schedule Calendar</h3>
          <StaffCalendar staffId={staff.id} />
        </div>
      </DialogContent>

      {isPerDiem && (
        <RecordAvailabilityDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          staff={[
            {
              id: staff.id,
              firstName: staff.firstName,
              lastName: staff.lastName,
            },
          ]}
          preselectedStaffId={staff.id}
          onSaved={fetchAvailability}
        />
      )}
    </Dialog>
  );
}
