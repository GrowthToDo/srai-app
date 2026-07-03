"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginFormProps {
  defaultEmail: string;
  defaultPassword: string;
  prefilled: boolean;
}

function LoginFormInner({
  defaultEmail,
  defaultPassword,
  prefilled,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Show the demo caption only until the manager link clears the fields.
  const [showDemoCaption, setShowDemoCaption] = useState(prefilled);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Invalid credentials");
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { role: "manager" | "nurse" };
      const destination =
        data.role === "manager" ? next ?? "/" : "/my";
      router.push(destination);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function loginAsManager() {
    setEmail("");
    setPassword("");
    setShowDemoCaption(false);
    setError(null);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          SimpleScheduleAI
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to your scheduling workspace.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {showDemoCaption && (
            <p className="text-muted-foreground text-xs">
              Demo nurse — credentials pre-filled
            </p>
          )}

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Log in"}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={loginAsManager}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Log in as manager
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoginForm(props: LoginFormProps) {
  // useSearchParams must sit under a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Card className="w-full max-w-sm p-6">Loading…</Card>}>
      <LoginFormInner {...props} />
    </Suspense>
  );
}
