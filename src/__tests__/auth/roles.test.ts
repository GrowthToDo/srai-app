/**
 * Unit tests for src/lib/auth/roles.ts — pure authorization matrix.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@/lib/auth/roles";

describe("authorize — nurse allow-list", () => {
  const allow: [string, string][] = [
    ["/api/staff/staff-1/schedule", "GET"],
    ["/api/staff-leave", "GET"],
    ["/api/staff-leave", "POST"],
    ["/api/callouts", "POST"],
    ["/api/swap-requests", "GET"],
    ["/api/swap-requests", "POST"],
    ["/api/prn-availability", "GET"],
    ["/api/prn-availability", "POST"],
    ["/api/schedules", "GET"],
    ["/api/schedules/sched-1", "GET"],
    ["/api/auth/me", "GET"],
    ["/api/auth/login", "POST"],
  ];

  it.each(allow)("allows nurse %s %s", (path, method) => {
    expect(authorize(path, method, "nurse")).toBe("allow");
  });
});

describe("authorize — nurse denies", () => {
  const deny: [string, string][] = [
    // Mutating manager routes
    ["/api/scenarios/generate", "POST"],
    ["/api/scenarios", "POST"],
    ["/api/scenarios/scen-1", "PUT"],
    ["/api/schedules", "POST"],
    ["/api/schedules/sched-1", "PUT"],
    ["/api/schedules/sched-1", "POST"],
    ["/api/staff", "GET"],
    ["/api/staff", "POST"],
    ["/api/staff/staff-1", "GET"],
    ["/api/import", "POST"],
    ["/api/rules", "GET"],
    ["/api/rules/rule-1", "PUT"],
    ["/api/units", "GET"],
    ["/api/census", "POST"],
    ["/api/shift-definitions", "POST"],
    ["/api/holidays", "POST"],
    ["/api/evaluate", "POST"],
    ["/api/open-shifts", "POST"],
    ["/api/open-shifts/os-1", "PUT"],
    ["/api/audit", "GET"],
    ["/api/analytics", "GET"],
    ["/api/dashboard", "GET"],
    ["/api/notifications", "GET"],
    ["/api/assignments", "POST"],
    ["/api/practice-examples", "POST"],
    // Method mismatches on nurse-readable collections
    ["/api/staff-leave", "PUT"],
    ["/api/callouts", "GET"],
    ["/api/callouts/co-1", "PUT"],
    ["/api/swap-requests/sr-1", "PUT"],
    ["/api/swap-requests/sr-1/validate", "POST"],
    ["/api/prn-availability/prn-1", "PUT"],
    ["/api/staff-leave/leave-1", "PUT"],
    ["/api/staff/staff-1/schedule", "POST"],
    ["/api/schedules/sched-1/assignments", "GET"],
  ];

  it.each(deny)("denies nurse %s %s", (path, method) => {
    expect(authorize(path, method, "nurse")).toBe("deny");
  });
});

describe("authorize — nurse page rules", () => {
  it("allows /my and /login", () => {
    expect(authorize("/my", "GET", "nurse")).toBe("allow");
    expect(authorize("/my/schedule", "GET", "nurse")).toBe("allow");
    expect(authorize("/login", "GET", "nurse")).toBe("allow");
  });

  it("denies manager pages", () => {
    expect(authorize("/", "GET", "nurse")).toBe("deny");
    expect(authorize("/dashboard", "GET", "nurse")).toBe("deny");
    expect(authorize("/staff", "GET", "nurse")).toBe("deny");
    expect(authorize("/settings/units", "GET", "nurse")).toBe("deny");
  });
});

describe("authorize — manager allow-all", () => {
  const samples: [string, string][] = [
    ["/api/scenarios/generate", "POST"],
    ["/api/staff", "DELETE"],
    ["/api/import", "POST"],
    ["/api/audit", "GET"],
    ["/dashboard", "GET"],
    ["/", "GET"],
    ["/api/schedules/sched-1", "PUT"],
  ];

  it.each(samples)("allows manager %s %s", (path, method) => {
    expect(authorize(path, method, "manager")).toBe("allow");
  });
});
