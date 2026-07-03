"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { Repeat } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignedOutCard } from "@/components/nurse/signed-out-card";
import {
  upcomingShifts,
  type NurseDay,
  type NurseShift,
} from "@/lib/nurse/schedule-helpers";

// Enriched swap shape returned by GET /api/swap-requests (raw row + joins).
interface SwapRequest {
  id: string;
  requestingStaffId: string;
  targetStaffId: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  notes: string | null;
  validationNotes: string | null;
  denialReason: string | null;
  requestor: { firstName: string; lastName: string } | null;
  target: { firstName: string; lastName: string } | null;
  requestorShiftDate: string | null;
  targetShiftDate: string | null;
}

// Colleague + their upcoming shifts, from GET /api/my/swap-options.
interface SwapOptionAssignment {
  assignmentId: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
}
interface SwapOptionColleague {
  staffId: string;
  name: string;
  role: string;
  assignments: SwapOptionAssignment[];
}

// Sentinel value for the "Anyone" (open swap) choice in the "Swap with" select.
const ANYONE = "__anyone__";

function fullName(p: { firstName: string; lastName: string } | null): string {
  return p ? `${p.firstName} ${p.lastName}` : "A colleague";
}

function shiftTypeLabel(t: string): string {
  return t === "night" ? "Night" : t === "day" ? "Day" : "Eve";
}

function fmtDate(d: string | null): string {
  return d ? format(new Date(d + "T00:00:00"), "EEE, MMM d") : "—";
}

/** Label + style for a swap in the "My requests" list. */
function myRequestStatus(s: SwapRequest): { label: string; className: string } {
  if (s.status === "approved")
    return {
      label: "Approved",
      className:
        "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
    };
  if (s.status === "denied" || s.status === "cancelled")
    return {
      label: s.status === "denied" ? "Denied" : "Cancelled",
      className:
        "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
    };
  // pending — distinguish "awaiting manager after a target accepted" from plain pending
  if (s.validationNotes && s.validationNotes.startsWith("Accepted by"))
    return {
      label: "Awaiting manager",
      className:
        "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
    };
  return {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  };
}

export default function SwapsPage() {
  const { user, loading: sessionLoading } = useSession();
  const { addToast } = useToast();

  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [myShifts, setMyShifts] = useState<NurseShift[]>([]);
  const [open, setOpen] = useState(false);
  const [chosenAssignment, setChosenAssignment] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Directed-swap dialog state (step 2 + step 3).
  const [colleagues, setColleagues] = useState<SwapOptionColleague[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  // "" until a shift is picked; then ANYONE (open) or a colleague's staffId.
  const [swapWith, setSwapWith] = useState<string>(ANYONE);
  const [chosenTargetAssignment, setChosenTargetAssignment] = useState("");

  const staffId = user?.staffId ?? null;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const fetchSwaps = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      // Server scopes a nurse to swaps they are a party to; the param is a hint.
      const res = await fetch(`/api/swap-requests?staffId=${staffId}`);
      const data = await res.json();
      setSwaps(Array.isArray(data) ? data : []);
    } catch {
      setSwaps([]);
    }
    setLoading(false);
  }, [staffId]);

  // Load my own upcoming published assignments to offer in the "Ask for a swap"
  // dialog (a 2-month forward window is plenty for a swap request).
  const fetchMyShifts = useCallback(async () => {
    if (!staffId) return;
    const rangeStart = format(startOfMonth(subMonths(new Date(), 0)), "yyyy-MM-dd");
    const rangeEnd = format(endOfMonth(addMonths(new Date(), 2)), "yyyy-MM-dd");
    try {
      const res = await fetch(
        `/api/staff/${staffId}/schedule?startDate=${rangeStart}&endDate=${rangeEnd}`
      );
      const data = await res.json();
      const days: NurseDay[] = Array.isArray(data.days) ? data.days : [];
      setMyShifts(upcomingShifts(days, todayStr).filter((s) => s.status === "assigned"));
    } catch {
      setMyShifts([]);
    }
  }, [staffId, todayStr]);

  useEffect(() => {
    if (staffId) {
      fetchSwaps();
      fetchMyShifts();
    }
  }, [staffId, fetchSwaps, fetchMyShifts]);

  // When the nurse picks one of their shifts, load same-role colleagues (and
  // their upcoming shifts) so they can optionally direct the swap at a person.
  useEffect(() => {
    if (!chosenAssignment) {
      setColleagues([]);
      return;
    }
    let cancelled = false;
    setOptionsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/my/swap-options?assignmentId=${chosenAssignment}`
        );
        const data = await res.json();
        if (!cancelled)
          setColleagues(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setColleagues([]);
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chosenAssignment]);

  const selectedColleague = useMemo(
    () => colleagues.find((c) => c.staffId === swapWith) ?? null,
    [colleagues, swapWith]
  );

  const needsResponse = useMemo(
    () =>
      swaps.filter(
        (s) => s.status === "pending" && s.targetStaffId === staffId
      ),
    [swaps, staffId]
  );
  const myRequests = useMemo(
    () => swaps.filter((s) => s.requestingStaffId === staffId),
    [swaps, staffId]
  );

  async function respond(swapId: string, action: "accept" | "decline") {
    setActingId(swapId);
    try {
      const res = await fetch(`/api/swap-requests/${swapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not update swap",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast(
        action === "accept"
          ? {
              title: "Swap accepted",
              description: "Sent to your manager for final approval.",
              variant: "success",
            }
          : { title: "Swap declined", variant: "default" }
      );
      await fetchSwaps();
    } catch {
      addToast({
        title: "Could not update swap",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setActingId(null);
    }
  }

  function resetDialog() {
    setChosenAssignment("");
    setNote("");
    setSwapWith(ANYONE);
    setChosenTargetAssignment("");
    setColleagues([]);
  }

  const directed = swapWith !== ANYONE;
  const canSubmit =
    !!chosenAssignment &&
    !submitting &&
    (!directed || !!chosenTargetAssignment);

  async function submitSwap() {
    if (!chosenAssignment || !staffId) return;
    if (directed && !chosenTargetAssignment) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/swap-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Server stamps requestingStaffId from the session; the nurse cannot
          // spoof the requesting side. Target fields are legitimate input.
          requestingAssignmentId: chosenAssignment,
          targetStaffId: directed ? swapWith : null,
          targetAssignmentId: directed ? chosenTargetAssignment : null,
          notes: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not request swap",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({
        title: "Swap requested",
        description: directed
          ? `${selectedColleague?.name ?? "Your colleague"} will be asked to accept.`
          : "Your manager will find a match.",
        variant: "success",
      });
      setOpen(false);
      resetDialog();
      await fetchSwaps();
    } catch {
      addToast({
        title: "Could not request swap",
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
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!user) return <SignedOutCard />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Shift swaps
        </h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Repeat className="size-4" />
          Ask for a swap
        </Button>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          {/* Needs your response */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Needs your response
            </h2>
            {needsResponse.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Nothing waiting on you right now.
                </CardContent>
              </Card>
            ) : (
              needsResponse.map((s) => (
                <Card key={s.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="text-sm">
                      <span className="font-medium">{fullName(s.requestor)}</span>{" "}
                      wants to swap.
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted/60 p-2">
                        <div className="text-[11px] text-muted-foreground">
                          Their shift
                        </div>
                        <div className="font-medium">
                          {fmtDate(s.requestorShiftDate)}
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/60 p-2">
                        <div className="text-[11px] text-muted-foreground">
                          Your shift
                        </div>
                        <div className="font-medium">
                          {fmtDate(s.targetShiftDate)}
                        </div>
                      </div>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-muted-foreground">{s.notes}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={actingId === s.id}
                        onClick={() => respond(s.id, "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={actingId === s.id}
                        onClick={() => respond(s.id, "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          {/* My requests */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              My requests
            </h2>
            {myRequests.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  You haven&apos;t asked for any swaps yet.
                </CardContent>
              </Card>
            ) : (
              myRequests.map((s) => {
                const meta = myRequestStatus(s);
                return (
                  <Card key={s.id}>
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {fmtDate(s.requestorShiftDate)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {s.targetStaffId
                            ? `Swap with ${fullName(s.target)}`
                            : "Open swap — manager will find a match"}
                        </div>
                        {s.status === "denied" && s.denialReason && (
                          <div className="text-xs text-muted-foreground">
                            {s.denialReason}
                          </div>
                        )}
                      </div>
                      <Badge className={meta.className} variant="outline">
                        {meta.label}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>
        </>
      )}

      {/* Ask for a swap dialog */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask for a swap</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step 1 — pick MY shift */}
            <div className="space-y-1.5">
              <Label htmlFor="swap-shift">Which of your shifts?</Label>
              {myShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You have no upcoming published shifts to swap.
                </p>
              ) : (
                <Select
                  value={chosenAssignment}
                  onValueChange={(v) => {
                    setChosenAssignment(v);
                    // A new shift means fresh options — reset step 2/3.
                    setSwapWith(ANYONE);
                    setChosenTargetAssignment("");
                  }}
                >
                  <SelectTrigger id="swap-shift" className="w-full">
                    <SelectValue placeholder="Pick one of your shifts" />
                  </SelectTrigger>
                  <SelectContent>
                    {myShifts.map((s) => (
                      <SelectItem key={s.assignmentId} value={s.assignmentId}>
                        {format(new Date(s.date + "T00:00:00"), "EEE, MMM d")} ·{" "}
                        {shiftTypeLabel(s.shiftType)} {s.startTime}–{s.endTime}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Step 2 — swap with anyone, or a specific colleague */}
            {chosenAssignment && (
              <div className="space-y-1.5">
                <Label htmlFor="swap-with">Swap with</Label>
                <Select
                  value={swapWith}
                  onValueChange={(v) => {
                    setSwapWith(v);
                    setChosenTargetAssignment("");
                  }}
                >
                  <SelectTrigger id="swap-with" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANYONE}>
                      Anyone — let my manager find cover
                    </SelectItem>
                    {colleagues.map((c) => (
                      <SelectItem key={c.staffId} value={c.staffId}>
                        {c.name} ({c.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {optionsLoading && (
                  <p className="text-xs text-muted-foreground">
                    Loading colleagues…
                  </p>
                )}
              </div>
            )}

            {/* Step 3 — which of THEIR shifts you'd take (directed only) */}
            {directed && selectedColleague && (
              <div className="space-y-1.5">
                <Label htmlFor="swap-their-shift">
                  Which of their shifts would you take?
                </Label>
                {selectedColleague.assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedColleague.name} has no upcoming shifts to trade.
                  </p>
                ) : (
                  <Select
                    value={chosenTargetAssignment}
                    onValueChange={setChosenTargetAssignment}
                  >
                    <SelectTrigger id="swap-their-shift" className="w-full">
                      <SelectValue placeholder="Pick one of their shifts" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedColleague.assignments.map((a) => (
                        <SelectItem key={a.assignmentId} value={a.assignmentId}>
                          {format(new Date(a.date + "T00:00:00"), "EEE, MMM d")} ·{" "}
                          {shiftTypeLabel(a.shiftType)} {a.startTime}–{a.endTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="swap-note">Note (optional)</Label>
              <Textarea
                id="swap-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything your manager should know"
                rows={2}
              />
            </div>

            <p className="rounded-md bg-accent/60 p-2 text-xs text-muted-foreground">
              {directed && selectedColleague
                ? `${selectedColleague.name.split(" ")[0]} will be asked to accept, then your manager gives final approval.`
                : "Your manager will find a match or a colleague can take it."}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetDialog();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submitSwap} disabled={!canSubmit}>
              {submitting ? "Sending…" : "Request swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
