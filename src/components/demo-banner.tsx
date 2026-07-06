"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ResetState = "idle" | "resetting" | "rate-limited" | "error";

/**
 * Slim strip pinned above app content, shown only when the deployment is
 * running in demo mode. Propless like GuideNudge: fetches its own state
 * (GET /api/demo/status) on mount and self-hides otherwise, so it's safe to
 * mount unconditionally in the root layout — founder/tenant instances make
 * one cheap status call and render nothing.
 *
 * Confirm dialog is composed from the Dialog primitives (no dedicated
 * AlertDialog component exists in src/components/ui).
 */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetState, setResetState] = useState<ResetState>("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/status")
      .then((res) => res.json())
      .then((body: { demo?: boolean; resetAt?: string | null }) => {
        if (cancelled || !body?.demo) return;
        setDemo(true);
        // Server resets wipe the DB but can't reach this browser's
        // localStorage — the fcg:* onboarding flags would keep steps struck
        // out on an empty hospital. When the server's reset epoch is newer
        // than the one this browser last saw, fire the provider's full-reset
        // event (clears every flag key and refetches counts).
        if (body.resetAt) {
          const SEEN_KEY = "demo:seenResetAt";
          if (localStorage.getItem(SEEN_KEY) !== body.resetAt) {
            localStorage.setItem(SEEN_KEY, body.resetAt);
            window.dispatchEvent(new Event("onboarding-reset"));
          }
        }
      })
      .catch(() => {
        // status check failing just means the banner stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo) return null;

  async function handleConfirmReset() {
    setResetState("resetting");
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (res.status === 200) {
        window.location.reload();
        return;
      }
      if (res.status === 429) {
        setResetState("rate-limited");
        return;
      }
      setResetState("error");
    } catch {
      setResetState("error");
    }
  }

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
      <span>
        Demo environment — start by importing the sample roster; Reset wipes
        everything.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto shrink-0"
        onClick={() => {
          setResetState("idle");
          setConfirmOpen(true);
        }}
      >
        Reset demo
      </Button>
      {resetState === "rate-limited" && (
        <span className="shrink-0 text-amber-700 dark:text-amber-300">
          Just reset — try again in a minute.
        </span>
      )}
      {resetState === "error" && (
        <span className="shrink-0 text-amber-700 dark:text-amber-300">
          Reset failed — please try again.
        </span>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>
              This wipes ALL demo data back to an empty hospital. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleConfirmReset();
                setConfirmOpen(false);
              }}
              disabled={resetState === "resetting"}
            >
              Reset demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
