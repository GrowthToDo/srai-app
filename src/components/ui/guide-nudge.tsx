"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/lib/onboarding/use-onboarding";
import { getNudge } from "@/lib/onboarding/guide";

/**
 * One-line contextual "do this next" banner for the first cycle. Fully propless:
 * it reads the derived stage from the onboarding hook and the current page from
 * the router, then resolves the right copy. Renders nothing when the guide is
 * still loading, dismissed, or has nothing to say on this page — so pages just
 * drop <GuideNudge /> in and the banner appears only when it should.
 *
 * The pulsing dot matches the sidebar next-step beacon so users connect the two.
 */
export function GuideNudge() {
  const { guide, practice, visits, markStaffReviewed } = useOnboarding();
  const pathname = usePathname();
  const router = useRouter();

  if (!guide || guide.dismissed) return null;

  const nudge = getNudge(
    guide.stage,
    pathname,
    guide.activeScheduleId,
    practice,
    visits
  );
  if (!nudge) return null;

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200 animate-fade-in">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70 motion-reduce:hidden" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <span className="font-semibold shrink-0">Next step:</span>
      <span>{nudge.message}</span>
      {nudge.action === "staff-reviewed" && nudge.actionLabel && (
        <Button
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => {
            markStaffReviewed();
            router.push("/schedule");
          }}
        >
          {nudge.actionLabel}
        </Button>
      )}
      {nudge.href && nudge.linkLabel && (
        <Link
          href={nudge.href}
          className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
        >
          {nudge.linkLabel} →
        </Link>
      )}
    </div>
  );
}
