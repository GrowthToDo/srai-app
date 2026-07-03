"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { PresetChips } from "@/components/prn-availability/preset-chips";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { serializeAvailableDates, toIsoDate } from "@/lib/prn-availability";

interface StaffOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface ExistingAvailability {
  staffId: string;
  availableDates: string[];
  notes: string | null;
}

interface RecordAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PRN staff selectable in the dialog (a single entry pins the dropdown). */
  staff: StaffOption[];
  /** Pre-select this nurse when the dialog opens (e.g. from a Missing chip). */
  preselectedStaffId?: string;
  /** Called after a successful save, so consumers can refresh their views. */
  onSaved?: () => void | Promise<void>;
}

// Availability window: today through +90 days.
function availabilityBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 90);
  return { from, to };
}

/**
 * Manager-side "Record availability" dialog, shared by the PRN Availability
 * page and the staff detail dialog. Owns the calendar + preset chips + notes
 * and the POST to /api/prn-availability (saving replaces the nurse's current
 * availability — same contract as before extraction). Fetches existing
 * availability on open so switching nurses pre-loads their current dates
 * instead of blanking them.
 */
export function RecordAvailabilityDialog({
  open,
  onOpenChange,
  staff,
  preselectedStaffId,
  onSaved,
}: RecordAvailabilityDialogProps) {
  const { addToast } = useToast();

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availabilityByStaff, setAvailabilityByStaff] = useState<
    Map<string, ExistingAvailability>
  >(new Map());

  // Tracks the current selection so the async availability fetch never
  // clobbers a nurse the manager switched to mid-flight.
  const selectedStaffIdRef = useRef("");

  const { from, to } = useMemo(availabilityBounds, []);

  function applyStaffRecord(
    staffId: string,
    map: Map<string, ExistingAvailability>
  ) {
    const current = staffId ? map.get(staffId) : undefined;
    setSelectedDates(
      (current?.availableDates ?? []).map((d) => new Date(d + "T00:00:00"))
    );
    setNotes(current?.notes ?? "");
  }

  // On open: reset to the preselected nurse (if any) and fetch existing
  // availability so an edit replaces rather than blanks their record.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const targetId = preselectedStaffId ?? "";
    selectedStaffIdRef.current = targetId;
    setSelectedStaffId(targetId);
    setSelectedDates([]);
    setNotes("");

    (async () => {
      try {
        const res = await fetch("/api/prn-availability");
        const data: ExistingAvailability[] = await res.json();
        if (cancelled) return;
        const map = new Map<string, ExistingAvailability>();
        if (Array.isArray(data)) {
          for (const row of data) map.set(row.staffId, row);
        }
        setAvailabilityByStaff(map);
        // Pre-load the target nurse's record unless the manager has already
        // switched to someone else while the fetch was in flight.
        if (selectedStaffIdRef.current === targetId) {
          applyStaffRecord(targetId, map);
        }
      } catch {
        if (!cancelled) setAvailabilityByStaff(new Map());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, preselectedStaffId]);

  // When the manager picks a different nurse mid-dialog, reload that nurse's
  // existing dates/notes.
  function onStaffChange(staffId: string) {
    selectedStaffIdRef.current = staffId;
    setSelectedStaffId(staffId);
    applyStaffRecord(staffId, availabilityByStaff);
  }

  const selectedIso = useMemo(
    () => serializeAvailableDates(selectedDates.map(toIsoDate)),
    [selectedDates]
  );

  const canSubmit = !!selectedStaffId && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/prn-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: selectedStaffId,
          availableDates: selectedIso,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast({
          title: "Could not save availability",
          description: err.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      const staffName = staff.find((s) => s.id === selectedStaffId);
      addToast({
        title: "Availability recorded",
        description: staffName
          ? `${staffName.firstName} ${staffName.lastName}: ${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"}.`
          : `${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"} recorded.`,
        variant: "success",
      });
      onOpenChange(false);
      await onSaved?.();
    } catch {
      addToast({
        title: "Could not save availability",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record availability</DialogTitle>
          <DialogDescription>
            Enter the days a PRN nurse told you they can work. Saving replaces
            their current availability.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prn-staff">PRN staff</Label>
            <Select value={selectedStaffId} onValueChange={onStaffChange}>
              <SelectTrigger id="prn-staff" className="w-full">
                <SelectValue placeholder="Select a PRN nurse" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Available days</Label>
            <PresetChips
              selected={selectedDates}
              onChange={setSelectedDates}
              from={from}
              to={to}
            />
            <div className="flex justify-center rounded-md border">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(days) => setSelectedDates(days ?? [])}
                disabled={{ before: from, after: to }}
                startMonth={from}
                endMonth={to}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedIso.length} day{selectedIso.length === 1 ? "" : "s"}{" "}
              selected
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prn-notes">Notes (optional)</Label>
            <Textarea
              id="prn-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth noting about this availability"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save availability"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
