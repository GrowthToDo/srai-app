"use client";

import { useSession } from "@/lib/auth/use-session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Phase 1 placeholder for the nurse portal. Nurses are redirected here by the
 * middleware when they hit a manager-only page, so it needs to land somewhere
 * sensible. The real self-service nurse UI ships in Phase 2.
 */
export default function MyPortalPage() {
  const { user, loading } = useSession();

  const who = loading
    ? "…"
    : user
      ? user.name
      : "there";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center">
      <Card className="w-full">
        <CardHeader>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Nurse portal coming soon
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            You&apos;re logged in as {who}. The self-service nurse portal —
            your schedule, callouts, swaps, and leave requests — is on the way.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
