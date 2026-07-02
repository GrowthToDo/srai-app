"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * One-line contextual "do this next" banner, shown ONLY during the first cycle
 * (until the first schedule is published). Pages pass context-specific copy;
 * visibility is handled here so every page doesn't re-implement it. The pulsing
 * green dot matches the sidebar's next-step beacon so users connect the two.
 */
export function FirstRunNudge({ message, href, linkLabel, show = true }: {
  message: string;
  /** Optional call-to-action link on the right. */
  href?: string;
  linkLabel?: string;
  /** Page-level condition (e.g. only when the grid is still empty). */
  show?: boolean;
}) {
  const [firstCycleDone, setFirstCycleDone] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j) => setFirstCycleDone((j.onboarding?.publishedCount ?? 0) > 0))
      .catch(() => setFirstCycleDone(true)); // fail closed — never nag on error
  }, []);

  if (!show || firstCycleDone !== false) return null;

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200 animate-fade-in">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70 motion-reduce:hidden" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <span className="font-semibold shrink-0">Next step:</span>
      <span>{message}</span>
      {href && linkLabel && (
        <Link href={href} className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
