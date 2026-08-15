"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { HandHelping } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { fetchJson } from "@/lib/fetch-json";

interface BoardShift {
  id: string;
  date: string;
  shiftType: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  unit: string;
  priority: string;
  interested: boolean;
  interestCount: number;
}

/**
 * "Open shifts you can pick up" — the nurse side of open-shift coverage.
 *
 * Shows ONLY shifts the engine says this nurse could legally take (the API
 * filters by rule eligibility). Raising a hand is interest, not assignment:
 * the manager confirms the fill from /open-shifts. Renders nothing when there
 * is nothing to show — an empty board is noise on a nurse's home screen.
 */
export function OpenShiftBoard() {
  const { addToast } = useToast();
  const [shifts, setShifts] = useState<BoardShift[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setShifts(await fetchJson<BoardShift[]>("/api/my/open-shifts"));
    } catch {
      // Board is a bonus surface — failing quietly beats an error banner on
      // the nurse's main schedule page.
      setShifts([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleInterest(s: BoardShift) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/my/open-shifts/${s.id}/interest`, {
        method: s.interested ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: s.interested ? undefined : JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not update",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({
        title: s.interested ? "Hand withdrawn" : "Hand raised",
        description: s.interested
          ? undefined
          : "Your manager will see you're interested and confirm who covers it.",
        variant: "success",
      });
      await refresh();
    } catch {
      addToast({
        title: "Could not update",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (shifts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <HandHelping className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Open shifts you can pick up</h2>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {shifts.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-6 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {format(new Date(s.date + "T00:00:00"), "EEE, MMM d")}
                  </span>
                  {s.priority === "urgent" && (
                    <Badge variant="destructive" className="text-[10px]">
                      Urgent
                    </Badge>
                  )}
                  {s.interestCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {s.interestCount} interested
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {s.shiftName} {s.startTime}–{s.endTime} · {s.unit}
                </div>
              </div>
              <Button
                size="sm"
                variant={s.interested ? "outline" : "default"}
                disabled={busyId === s.id}
                onClick={() => toggleInterest(s)}
              >
                {busyId === s.id
                  ? "…"
                  : s.interested
                    ? "Withdraw"
                    : "I'm interested"}
              </Button>
            </li>
          ))}
        </ul>
        <p className="px-6 pb-4 pt-2 text-xs text-muted-foreground">
          Raising a hand tells your manager you&apos;re available — they confirm
          who covers the shift.
        </p>
      </CardContent>
    </Card>
  );
}
