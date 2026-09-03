"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  differenceInCalendarDays,
} from "date-fns";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignedOutCard } from "@/components/nurse/signed-out-card";
import { NurseMonthCalendar } from "@/components/nurse/nurse-month-calendar";
import { OpenShiftBoard } from "@/components/nurse/open-shift-board";
import {
  nextShift,
  upcomingShifts,
  countdownLabel,
  type NurseDay,
  type NurseShift,
} from "@/lib/nurse/schedule-helpers";

// EVERY nurse-initiated absence is a time-off REQUEST that lands in the
// manager's Leave queue for approval — nothing a nurse taps here bypasses the
// manager or writes a callout directly (founder direction 2026-08-15). On
// approval, the server decides coverage: within the unit's callout threshold
// (default 7 days) it creates an urgent callout, further out an open shift.
// This constant only tunes the urgency COPY shown to the nurse.
const URGENT_COPY_THRESHOLD_DAYS = 7;

// Time-off types a nurse may request — subset of the staffLeave.leaveType
// schema enum (maternity is arranged with the manager directly, not via a
// one-tap shift dialog).
const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "sick", label: "Sick" },
  { value: "vacation", label: "Vacation" },
  { value: "personal", label: "Personal" },
  { value: "medical", label: "Medical appointment" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
];

function shiftTypeLabel(t: string): string {
  if (t === "day") return "Day shift";
  if (t === "night") return "Night shift";
  if (t === "evening") return "Evening shift";
  return "Shift";
}

export default function MySchedulePage() {
  const { user, loading: sessionLoading } = useSession();
  const { addToast } = useToast();

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [days, setDays] = useState<NurseDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NurseShift | null>(null);
  // PRN nurses with no availability on file get a "submit your days" hero
  // instead of "enjoy the breather" — an empty PRN schedule usually means the
  // manager has nothing to schedule them FROM, not that they're off the hook.
  const [hasAvailability, setHasAvailability] = useState<boolean | null>(null);

  useEffect(() => {
    if (user?.employmentType !== "per_diem" || !user.staffId) return;
    fetch("/api/prn-availability")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { staffId: string; availableDates: string[] }[]) => {
        const own = rows.find((r) => r.staffId === user.staffId);
        setHasAvailability(!!own && own.availableDates.length > 0);
      })
      .catch(() => setHasAvailability(null));
  }, [user?.employmentType, user?.staffId]);
  const [leaveType, setLeaveType] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Own pending time-off requests, so a shift the nurse already asked off
  // shows "request pending" instead of offering the form again.
  const [pendingRanges, setPendingRanges] = useState<
    { startDate: string; endDate: string }[]
  >([]);

  const staffId = user?.staffId ?? null;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Fetch a 3-month window (prev/current/next month around the displayed month)
  // so the "next shift" hero and "upcoming" list can look past the month edge.
  const fetchSchedule = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    const rangeStart = format(
      startOfMonth(subMonths(currentMonth, 1)),
      "yyyy-MM-dd",
    );
    const rangeEnd = format(
      endOfMonth(addMonths(currentMonth, 1)),
      "yyyy-MM-dd",
    );
    try {
      const res = await fetch(
        `/api/staff/${staffId}/schedule?startDate=${rangeStart}&endDate=${rangeEnd}`,
      );
      const data = await res.json();
      setDays(Array.isArray(data.days) ? data.days : []);
    } catch {
      setDays([]);
    }
    setLoading(false);
  }, [staffId, currentMonth]);

  useEffect(() => {
    if (staffId) fetchSchedule();
  }, [staffId, fetchSchedule]);

  const next = useMemo(() => nextShift(days, todayStr), [days, todayStr]);
  const upcoming = useMemo(
    () => upcomingShifts(days, todayStr, 10),
    [days, todayStr],
  );

  const fetchPendingRequests = useCallback(async () => {
    if (!staffId) return;
    try {
      const res = await fetch(`/api/staff-leave?staffId=${staffId}`);
      if (!res.ok) return;
      const rows: { status: string; startDate: string; endDate: string }[] =
        await res.json();
      setPendingRanges(
        rows
          .filter((r) => r.status === "pending")
          .map((r) => ({ startDate: r.startDate, endDate: r.endDate })),
      );
    } catch {
      // Non-critical — worst case the nurse sees the form again and the
      // server-side duplicate handling applies.
    }
  }, [staffId]);

  useEffect(() => {
    if (staffId) fetchPendingRequests();
  }, [staffId, fetchPendingRequests]);

  function openShift(shift: NurseShift) {
    setSelected(shift);
    setNote("");
    setLeaveType("");
  }

  // Urgency is COPY only — the flow is identical for every date (manager
  // approval always; the server picks callout-vs-open-shift on approval).
  const daysUntilSelected = selected
    ? differenceInCalendarDays(
        new Date(selected.date + "T00:00:00"),
        new Date(),
      )
    : 0;
  const isUrgent = daysUntilSelected < URGENT_COPY_THRESHOLD_DAYS;
  const hasPendingForSelected =
    !!selected &&
    pendingRanges.some(
      (r) => selected.date >= r.startDate && selected.date <= r.endDate,
    );

  async function submitLeaveRequest() {
    if (!selected || !staffId || !leaveType) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/staff-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          leaveType,
          startDate: selected.date,
          endDate: selected.date,
          reason: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not send request",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({
        title: "Time-off request sent",
        description: "Your manager will review it. Track it under Time off.",
        variant: "success",
      });
      setSelected(null);
      await fetchPendingRequests();
    } catch {
      addToast({
        title: "Could not send request",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!user) return <SignedOutCard />;

  return (
    <div className="space-y-5">
      <h1
        className="text-xl font-semibold"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        My schedule
      </h1>

      {/* Next shift hero */}
      <Card className="gradient-primary border-0 py-0 text-primary-foreground">
        <CardContent className="p-4">
          {next ? (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs opacity-90">
                  <CalendarClock className="size-3.5" />
                  <span>Next shift</span>
                </div>
                <div className="text-lg font-semibold leading-tight">
                  {format(new Date(next.date + "T00:00:00"), "EEE, MMM d")}
                </div>
                <div className="text-sm opacity-90">
                  {shiftTypeLabel(next.shiftType)} {next.startTime}–
                  {next.endTime}
                </div>
              </div>
              <Badge className="bg-white/20 text-primary-foreground">
                {countdownLabel(todayStr, next.date)}
              </Badge>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs opacity-90">
                <CalendarClock className="size-3.5" />
                <span>Next shift</span>
              </div>
              {user.employmentType === "per_diem" &&
              hasAvailability === false ? (
                <div className="space-y-2">
                  <p className="text-sm opacity-90">
                    You haven&apos;t shared your availability yet — your manager
                    can only schedule you on days you mark as available.
                  </p>
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="!bg-white !text-primary hover:!bg-white/90"
                  >
                    <Link href="/my/availability">
                      Submit my availability →
                    </Link>
                  </Button>
                </div>
              ) : user.employmentType === "per_diem" ? (
                <p className="text-sm opacity-90">
                  No shifts assigned yet. Your manager schedules you from the
                  days you marked available.
                </p>
              ) : (
                <p className="text-sm opacity-90">
                  No upcoming shifts on your published schedule right now. Enjoy
                  the breather.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open shifts this nurse is eligible to pick up (renders nothing when empty) */}
      <OpenShiftBoard />

      {/* Month calendar */}
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-muted" />
          ) : (
            <NurseMonthCalendar
              days={days}
              currentMonth={currentMonth}
              onPrevMonth={() => setCurrentMonth((m) => subMonths(m, 1))}
              onNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
              onSelectShift={openShift}
            />
          )}
        </CardContent>
      </Card>

      {/* Upcoming shifts list */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Upcoming shifts</h2>
        </CardHeader>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nothing scheduled yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((s) => (
                <li key={s.assignmentId}>
                  <button
                    type="button"
                    onClick={() => openShift(s)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {format(new Date(s.date + "T00:00:00"), "EEE, MMM d")}
                        </span>
                        {s.status === "called_out" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Called out
                          </Badge>
                        )}
                        {s.isChargeNurse && (
                          <Badge variant="secondary" className="text-[10px]">
                            Charge
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {shiftTypeLabel(s.shiftType)} {s.startTime}–{s.endTime}{" "}
                        · {s.unit}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Shift detail + call-out bottom sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-2xl px-4 pb-6"
        >
          {selected && (
            <>
              <SheetHeader className="px-0">
                <SheetTitle>
                  {format(new Date(selected.date + "T00:00:00"), "EEEE, MMM d")}
                </SheetTitle>
                <SheetDescription>
                  {shiftTypeLabel(selected.shiftType)} {selected.startTime}–
                  {selected.endTime} · {selected.unit}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {selected.isChargeNurse && (
                    <Badge variant="secondary">Charge nurse</Badge>
                  )}
                  {selected.isOvertime && (
                    <Badge variant="warning">Overtime</Badge>
                  )}
                  {selected.isFloat && (
                    <Badge variant="outline">
                      Float
                      {selected.floatFromUnit
                        ? ` from ${selected.floatFromUnit}`
                        : ""}
                    </Badge>
                  )}
                  {selected.status === "called_out" && (
                    <Badge variant="destructive">Called out</Badge>
                  )}
                  {selected.status === "cancelled" && (
                    <Badge variant="destructive">Released</Badge>
                  )}
                </div>

                {selected.status === "called_out" ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    You&apos;ve already called out of this shift. Your manager
                    is arranging coverage.
                  </div>
                ) : selected.status === "cancelled" ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    You&apos;re released from this shift — your approved time
                    off covers this date and your manager is arranging coverage.
                  </div>
                ) : hasPendingForSelected ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    You already have a time-off request pending for this date.
                    Your manager will review it — track or withdraw it under{" "}
                    <Link href="/my/leave" className="underline">
                      Time off
                    </Link>
                    .
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">
                      Can&apos;t make this shift?
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="leave-type">Reason</Label>
                      <Select value={leaveType} onValueChange={setLeaveType}>
                        <SelectTrigger id="leave-type" className="w-full">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAVE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="leave-note">Note (optional)</Label>
                      <Textarea
                        id="leave-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Anything your manager should know"
                        rows={2}
                      />
                    </div>

                    {isUrgent ? (
                      <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          This shift is soon — your request goes to your manager
                          for approval right away, and coverage is arranged
                          urgently once approved.
                        </span>
                      </div>
                    ) : (
                      <p className="rounded-md bg-accent/60 p-2 text-xs text-muted-foreground">
                        This goes to your manager as a time-off request.
                        Coverage is arranged once it&apos;s approved — track or
                        withdraw it under Time off.
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={submitting}
                        onClick={() => setSelected(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={!leaveType || submitting}
                        onClick={submitLeaveRequest}
                      >
                        {submitting ? "Sending…" : "Request time off"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
