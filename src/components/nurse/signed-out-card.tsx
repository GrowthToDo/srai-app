"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Friendly fallback shown on any nurse page when there is no session (auth off
 * or logged out). Keeps the portal from crashing on a null user and points the
 * person at /login instead of a dead end.
 */
export function SignedOutCard() {
  return (
    <div className="flex min-h-[50vh] items-center">
      <Card className="w-full">
        <CardHeader>
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            You&apos;re not signed in
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign in to see your schedule, request time off, and handle shift
            swaps.
          </p>
          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
