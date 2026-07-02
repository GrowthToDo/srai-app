"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/lib/onboarding/use-onboarding";

/**
 * First-schedule-published celebration. Rendered by the provider layer whenever
 * the guide reaches S5 (first publish, not yet celebrated).
 *
 * Write-then-show latch: on mount we call markCelebrated() first so the sticky
 * flag is set immediately (unpublishing later can never re-trigger this). We hold
 * visibility in local state so that flag write — which flips the guide out of S5 —
 * doesn't unmount the modal mid-view. The user closes it explicitly.
 */
export function CelebrationModal() {
  const { guide, markCelebrated } = useOnboarding();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const shouldShow = guide?.showCelebration ?? false;

  useEffect(() => {
    if (shouldShow) {
      setVisible(true);
      markCelebrated();
    }
  }, [shouldShow, markCelebrated]);

  if (!visible) return null;

  function close() {
    setVisible(false);
  }

  function goToDashboard() {
    setVisible(false);
    router.push("/dashboard");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative w-full max-w-md mx-4 bg-card rounded-xl shadow-2xl border-2 border-primary/20 overflow-hidden animate-scale-in">
        <div className="gradient-hero p-6">
          <h2 className="text-2xl font-bold text-white">
            Your first schedule is live.
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Nurses can now see their shifts. From here, your day-to-day is
            handling what changes — callouts, swaps, time off, and coverage gaps.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button onClick={goToDashboard} className="w-full sm:w-auto">
              Show me the daily tools →
            </Button>
            <button
              type="button"
              onClick={close}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              I&apos;ll explore on my own
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
