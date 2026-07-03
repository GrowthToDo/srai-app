"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
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
import {
  nextShift,
  upcomingShifts,
  countdownLabel,
  type NurseDay,
  type NurseShift,
} from "@/lib/nurse/schedule-helpers";

// Callout reasons a nurse may pick — matches the callout.reason schema enum
// (no_show is manager-only, so it is intentionally excluded here).
const CALLOUT_REASONS: { value: string; label: string }[] = [
  { value: "sick", label: "Sick" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "personal", label: "Personal" },
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
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const staffId = user?.staffId ?? null;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Fetch a 3-month window (prev/current/next month around the displayed month)
  // so the "next shift" hero and "upcoming" list can look past the month edge.
  const fetchSchedule = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    const rangeStart = format(startOfMonth(subMonths(currentMonth, 1)), "yyyy-MM-dd");
    const rangeEnd = format(endOfMonth(addMonths(currentMonth, 1)), "yyyy-MM-dd");
    try {
      const res = await fetch(
        `/api/staff/${staffId}/schedule?startDate=${rangeStart}&endDate=${rangeEnd}`
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
    [days, todayStr]
  );

  function openShift(shift: NurseShift) {
    setSelected(shift);
    setReason("");
    setNote("");
  }

  async function submitCallout() {
    if (!selected || !staffId || !reason) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/callouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: selected.assignmentId,
          staffId,
          shiftId: selected.shiftId,
          reason,
          reasonDetail: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not submit callout",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({
        title: "Callout submitted",
        description: "Your manager has been notified.",
        variant: "success",
      });
      setSelected(null);
      await fetchSchedule();
    } catch {
      addToast({
        title: "Could not submit callout",
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
        style={{ fontFamily: "var(--font-fraunces)" }}
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
                  {shiftTypeLabel(next.shiftType)} {next.startTime}–{next.endTime}
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
              {user.employmentType === "per_diem" && hasAvailability === false ? (
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
                    <Link href="/my/availability">Submit my availability →</Link>
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
                        {shiftTypeLabel(s.shiftType)} {s.startTime}–{s.endTime} ·{" "}
                        {s.unit}
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
                      Float{selected.floatFromUnit ? ` from ${selected.floatFromUnit}` : ""}
                    </Badge>
                  )}
                  {selected.status === "called_out" && (
                    <Badge variant="destructive">Called out</Badge>
                  )}
                </div>

                {selected.status === "called_out" ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    You&apos;ve already called out of this shift. Your manager is
                    arranging coverage.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">
                      Can&apos;t make this shift?
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="callout-reason">Reason</Label>
                      <Select value={reason} onValueChange={setReason}>
                        <SelectTrigger id="callout-reason" className="w-full">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {CALLOUT_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="callout-note">Note (optional)</Label>
                      <Textarea
                        id="callout-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Anything your manager should know"
                        rows={2}
                      />
                    </div>

                    <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Your manager will be notified and will arrange coverage.
                      </span>
                    </div>

                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={!reason || submitting}
                      onClick={submitCallout}
                    >
                      {submitting ? "Submitting…" : "Call out"}
                    </Button>
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
