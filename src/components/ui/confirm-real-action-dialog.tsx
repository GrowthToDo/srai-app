"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Guardrail dialog shown when a manager triggers approve / deny / fill on a
 * NON-practice record WHILE the practice tutorial is active.
 *
 * The founder once approved REAL imported leave requests believing they were
 * practice ones (real + practice rows list together). Teardown only removes
 * [PRACTICE] records, so those real approvals persisted — read as "revert is
 * broken". This confirms intent before acting on a real record; it never blocks.
 * Practice-marked rows skip this entirely and act immediately as before.
 */

/** The record kind, used to fill in the confirmation copy. */
export type RealActionKind =
  | "leave request"
  | "swap"
  | "callout"
  | "open shift";

export function ConfirmRealActionDialog({
  open,
  onOpenChange,
  kind,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: RealActionKind;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>This is a real request</DialogTitle>
          <DialogDescription>
            This one isn&apos;t part of the practice tutorial — it&apos;s a real{" "}
            {kind} from your roster. Handle it anyway?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Yes, handle it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
