"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarCheck } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { SignedOutCard } from "@/components/nurse/signed-out-card";
import { PresetChips } from "@/components/prn-availability/preset-chips";
import { serializeAvailableDates, toIsoDate } from "@/lib/prn-availability";

interface PRNAvailability {
  id: string;
  staffId: string;
  availableDates: string[];
  notes: string | null;
  submittedAt: string | null;
}

// Availability window: today through +90 days, matching the manager dialog.
function availabilityBounds(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 90);
  return { from, to };
}

export default function MyAvailabilityPage() {
  const { user, loading: sessionLoading } = useSession();
  const { addToast } = useToast();

  const [existing, setExisting] = useState<PRNAvailability | null>(null);
  const [selected, setSelected] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const staffId = user?.staffId ?? null;
  const { from, to } = useMemo(availabilityBounds, []);

  const fetchAvailability = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      // The server scopes a nurse to their own rows via x-staff-id; the
      // staffId param is a harmless hint (ignored for nurse callers).
      const res = await fetch(`/api/prn-availability?staffId=${staffId}`);
      const data = await res.json();
      const mine: PRNAvailability | null =
        Array.isArray(data) && data.length > 0 ? data[0] : null;
      setExisting(mine);
      setSelected(
        (mine?.availableDates ?? []).map((d) => new Date(d + "T00:00:00"))
      );
    } catch {
      setExisting(null);
      setSelected([]);
    }
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    if (staffId) fetchAvailability();
  }, [staffId, fetchAvailability]);

  const selectedIso = useMemo(
    () => serializeAvailableDates(selected.map(toIsoDate)),
    [selected]
  );

  async function save() {
    if (!staffId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/prn-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Server stamps staffId from the session for nurse callers; sending it
          // keeps the manager/off-auth path working too. scheduleId is defaulted
          // server-side to the shared PRN template anchor.
          staffId,
          availableDates: selectedIso,
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
      addToast({
        title: "Availability saved",
        description: `${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"} marked available.`,
        variant: "success",
      });
      await fetchAvailability();
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

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!user) return <SignedOutCard />;

  // Guard: only per_diem nurses have availability to submit. Full-time nurses
  // never see the tab, but a direct visit lands here — explain rather than 404.
  if (user.employmentType !== "per_diem") {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Availability is only for per diem (PRN) staff. Your schedule is
          managed directly by your manager.
        </CardContent>
      </Card>
    );
  }

  const nextDates = existing?.availableDates?.slice(0, 5) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          My availability
        </h1>
        <CalendarCheck className="size-5 text-muted-foreground" />
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : existing && existing.availableDates.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {existing.availableDates.length} day
                {existing.availableDates.length === 1 ? "" : "s"} marked
              </Badge>
              {existing.submittedAt && (
                <span className="text-xs text-muted-foreground">
                  Updated{" "}
                  {format(new Date(existing.submittedAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {nextDates.map((d) => (
                <Badge key={d} variant="outline" className="text-xs">
                  {format(new Date(d + "T00:00:00"), "EEE MMM d")}
                </Badge>
              ))}
              {existing.availableDates.length > nextDates.length && (
                <span className="text-xs text-muted-foreground">
                  +{existing.availableDates.length - nextDates.length} more
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            You haven&apos;t marked any days yet. Tap the days you can work
            below, then save.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-4">
          <PresetChips
            selected={selected}
            onChange={setSelected}
            from={from}
            to={to}
          />
          <Calendar
            mode="multiple"
            selected={selected}
            onSelect={(days) => setSelected(days ?? [])}
            disabled={{ before: from, after: to }}
            startMonth={from}
            endMonth={to}
            className="w-full"
          />
          <p className="w-full rounded-md bg-accent/60 p-2 text-xs text-muted-foreground">
            Your manager can only schedule you on days you mark available.
          </p>
          <Button
            onClick={save}
            disabled={submitting}
            className="w-full"
          >
            {submitting
              ? "Saving…"
              : `Save availability (${selectedIso.length} day${selectedIso.length === 1 ? "" : "s"})`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
