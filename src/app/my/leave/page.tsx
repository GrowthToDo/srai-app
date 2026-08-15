"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/auth/use-session";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

// Leave types — matches the staff_leave.leaveType schema enum.
const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "medical", label: "Medical" },
  { value: "maternity", label: "Maternity" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
];

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "denied";
  reason: string | null;
  submittedAt: string | null;
  createdAt: string | null;
}

const STATUS_META: Record<
  LeaveRequest["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  },
  approved: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  },
  denied: {
    label: "Denied",
    className:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  },
};

function typeLabel(v: string): string {
  return LEAVE_TYPES.find((t) => t.value === v)?.label ?? v;
}

export default function LeavePage() {
  const { user, loading: sessionLoading } = useSession();
  const { addToast } = useToast();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const staffId = user?.staffId ?? null;

  const fetchRequests = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      // The server scopes a nurse to their own rows via x-staff-id; the
      // staffId param is a harmless hint (ignored for nurse callers).
      const res = await fetch(`/api/staff-leave?staffId=${staffId}`);
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    }
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    if (staffId) fetchRequests();
  }, [staffId, fetchRequests]);

  function resetForm() {
    setLeaveType("");
    setStartDate("");
    setEndDate("");
    setReason("");
  }

  const canSubmit =
    !!leaveType &&
    !!startDate &&
    !!endDate &&
    startDate <= endDate &&
    !submitting;

  async function submit() {
    if (!canSubmit || !staffId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/staff-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Server stamps staffId from the session for nurse callers; sending it
          // keeps the manager/off-auth path working too.
          staffId,
          leaveType,
          startDate,
          endDate,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not submit request",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({
        title: "Time-off request sent",
        description: "Your manager will review it.",
        variant: "success",
      });
      setOpen(false);
      resetForm();
      await fetchRequests();
    } catch {
      addToast({
        title: "Could not submit request",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // Only pending requests are withdrawable — the API enforces the same rule
  // (403 not-yours / 409 already-decided), this is just the happy path.
  async function withdraw(id: string) {
    setWithdrawingId(id);
    try {
      const res = await fetch(`/api/staff-leave/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          title: "Could not withdraw",
          description: data.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      addToast({ title: "Request withdrawn", variant: "success" });
      await fetchRequests();
    } catch {
      addToast({
        title: "Could not withdraw",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setWithdrawingId(null);
    }
  }

  const sorted = [...requests].sort((a, b) =>
    (b.submittedAt ?? b.createdAt ?? "").localeCompare(
      a.submittedAt ?? a.createdAt ?? "",
    ),
  );

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
          Time off
        </h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Request
        </Button>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No time-off requests yet. Tap Request to submit one.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            return (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {typeLabel(r.leaveType)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(r.startDate + "T00:00:00"), "MMM d")} –{" "}
                        {format(
                          new Date(r.endDate + "T00:00:00"),
                          "MMM d, yyyy",
                        )}
                      </div>
                      {r.reason && (
                        <div className="text-xs text-muted-foreground">
                          {r.reason}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={meta.className} variant="outline">
                        {meta.label}
                      </Badge>
                      {r.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          disabled={withdrawingId === r.id}
                          onClick={() => withdraw(r.id)}
                        >
                          {withdrawingId === r.id ? "Withdrawing…" : "Withdraw"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request time off</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="leave-type">Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger id="leave-type" className="w-full">
                  <SelectValue placeholder="Select a type" />
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start">Start</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave-end">End</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">Reason (optional)</Label>
              <Textarea
                id="leave-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Anything your manager should know"
                rows={2}
              />
            </div>

            <p className="rounded-md bg-accent/60 p-2 text-xs text-muted-foreground">
              Approved leave within 7 days of a scheduled shift creates an
              urgent callout; further out it becomes an open shift your manager
              fills calmly.
            </p>
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
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
