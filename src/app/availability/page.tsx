"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTip, TERM_HELP } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { serializeAvailableDates, toIsoDate } from "@/lib/prn-availability";

interface PRNAvailability {
  id: string;
  staffId: string;
  staffFirstName: string | null;
  staffLastName: string | null;
  scheduleId: string;
  availableDates: string[];
  notes: string | null;
  submittedAt: string | null;
  createdAt: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  employmentType: string;
}

// Availability window: today through +90 days.
function availabilityBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 90);
  return { from, to };
}

export default function AvailabilityPage() {
  const { addToast } = useToast();
  const [availability, setAvailability] = useState<PRNAvailability[]>([]);
  const [prnStaff, setPrnStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Record-availability dialog state.
  const [open, setOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { from, to } = useMemo(availabilityBounds, []);

  const fetchData = useCallback(async () => {
    const [availRes, staffRes] = await Promise.all([
      fetch("/api/prn-availability"),
      fetch("/api/staff"),
    ]);
    const availData = await availRes.json();
    const staffData = await staffRes.json();
    setAvailability(availData);
    setPrnStaff(staffData.filter((s: StaffMember) => s.employmentType === "per_diem"));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group availability by staff
  const availabilityByStaff = new Map<string, PRNAvailability>();
  for (const a of availability) {
    availabilityByStaff.set(a.staffId, a);
  }

  // Find PRN staff who haven't submitted
  const submittedStaffIds = new Set(availability.map(a => a.staffId));
  const missingSubmissions = prnStaff.filter(s => !submittedStaffIds.has(s.id));

  const selectedIso = useMemo(
    () => serializeAvailableDates(selectedDates.map(toIsoDate)),
    [selectedDates]
  );

  // Open the dialog, optionally pre-selecting a nurse (from a Missing banner
  // chip) and pre-loading any availability they already have on file.
  function openDialog(staffId?: string) {
    const targetId = staffId ?? "";
    setSelectedStaffId(targetId);
    const current = targetId ? availabilityByStaff.get(targetId) : undefined;
    setSelectedDates(
      (current?.availableDates ?? []).map((d) => new Date(d + "T00:00:00"))
    );
    setNotes(current?.notes ?? "");
    setOpen(true);
  }

  // When the manager picks a different nurse mid-dialog, reload that nurse's
  // existing dates/notes so an edit replaces rather than blanks their record.
  function onStaffChange(staffId: string) {
    setSelectedStaffId(staffId);
    const current = availabilityByStaff.get(staffId);
    setSelectedDates(
      (current?.availableDates ?? []).map((d) => new Date(d + "T00:00:00"))
    );
    setNotes(current?.notes ?? "");
  }

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
      const staffName = prnStaff.find((s) => s.id === selectedStaffId);
      addToast({
        title: "Availability recorded",
        description: staffName
          ? `${staffName.firstName} ${staffName.lastName}: ${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"}.`
          : `${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"} recorded.`,
        variant: "success",
      });
      setOpen(false);
      await fetchData();
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
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="inline-flex items-center gap-2">
              PRN Availability
              <InfoTip label="What does PRN mean?">{TERM_HELP.prn}</InfoTip>
            </span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            View availability submitted by per diem (PRN) staff for scheduling
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <CalendarPlus className="size-4" />
          Record availability
        </Button>
      </div>

      {missingSubmissions.length > 0 && (
        <Card className="mb-6 border-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-yellow-600">Missing Submissions</CardTitle>
            <CardDescription>
              The following PRN staff have not submitted their availability
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {missingSubmissions.map(s => (
                <Button
                  key={s.id}
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog(s.id)}
                >
                  <CalendarPlus className="size-3.5" />
                  {s.firstName} {s.lastName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Submitted Availability</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : availability.length === 0 ? (
            <p className="text-muted-foreground">No availability submissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Available Days</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((avail) => (
                  <TableRow key={avail.id}>
                    <TableCell className="font-medium">
                      {avail.staffFirstName} {avail.staffLastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {avail.availableDates.length} days
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {avail.availableDates.slice(0, 3).join(", ")}
                          {avail.availableDates.length > 3 && "..."}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{avail.notes || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {avail.submittedAt ? new Date(avail.submittedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Availability Calendar</CardTitle>
          <CardDescription>Visual overview of PRN availability</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {availability.map((avail) => (
              <div key={avail.id} className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">
                  {avail.staffFirstName} {avail.staffLastName}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {avail.availableDates.map((date) => {
                    const d = new Date(date);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <Badge
                        key={date}
                        variant={isWeekend ? "default" : "outline"}
                        className="text-xs"
                      >
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
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
                  {prnStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Available days</Label>
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
                {selectedIso.length} day{selectedIso.length === 1 ? "" : "s"} selected
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
              onClick={() => setOpen(false)}
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
    </div>
  );
}
