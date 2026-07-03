/**
 * Pure, DB-free authorization. Given a request path + method + role, decide
 * "allow" | "deny". No imports, no side effects — fully unit-testable.
 *
 * Design: managers may do everything. Nurses are default-deny, with a small
 * explicit allow-list encoded as an ordered rule table (first match wins).
 *
 * Ownership (e.g. "a nurse may only read HER OWN schedule") is NOT decided
 * here — this layer only says the ROUTE is reachable for the role. The handler
 * enforces row-level ownership using the x-staff-id header (Phase 1 spec §10).
 */

export type Role = "manager" | "nurse";
export type Decision = "allow" | "deny";
export type Method = string;

interface Rule {
  /** Regex the pathname must fully match. */
  pattern: RegExp;
  /** Allowed methods (uppercased). "*" allows any method. */
  methods: string[];
  decision: Decision;
}

// Dynamic segment matcher: one path segment (no slash).
const SEG = "[^/]+";

/**
 * Ordered nurse allow-list. Everything not matched here is denied for nurses.
 * First match wins, so more specific rules precede broader ones.
 */
const NURSE_RULES: Rule[] = [
  // Auth endpoints are public anyway, but allow explicitly.
  { pattern: new RegExp(`^/api/auth(/.*)?$`), methods: ["*"], decision: "allow" },

  // A nurse reads their own schedule; the handler enforces id === x-staff-id.
  // GET /api/staff/[id]/schedule
  {
    pattern: new RegExp(`^/api/staff/${SEG}/schedule$`),
    methods: ["GET"],
    decision: "allow",
  },

  // Leave: view + submit.  GET+POST /api/staff-leave  (collection only)
  {
    pattern: new RegExp(`^/api/staff-leave$`),
    methods: ["GET", "POST"],
    decision: "allow",
  },

  // Callouts: a nurse may report their own callout.  POST /api/callouts
  {
    pattern: new RegExp(`^/api/callouts$`),
    methods: ["POST"],
    decision: "allow",
  },

  // Swap requests: view + create.  GET+POST /api/swap-requests (collection)
  {
    pattern: new RegExp(`^/api/swap-requests$`),
    methods: ["GET", "POST"],
    decision: "allow",
  },

  // PRN availability: view + submit.  GET+POST /api/prn-availability (collection)
  {
    pattern: new RegExp(`^/api/prn-availability$`),
    methods: ["GET", "POST"],
    decision: "allow",
  },

  // Schedules: read the list and a single schedule.
  // PHASE 2 TODO: published-only filtering for nurses (a nurse should not see
  // draft schedules). For Phase 1 the route is readable; the list handler still
  // returns all schedules. Enforce status="published" filtering here in Phase 2.
  {
    pattern: new RegExp(`^/api/schedules$`),
    methods: ["GET"],
    decision: "allow",
  },
  {
    pattern: new RegExp(`^/api/schedules/${SEG}$`),
    methods: ["GET"],
    decision: "allow",
  },
];

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Nurse page access (non-API). Nurses only get the future nurse portal (/my*)
 * and /login. Every manager page is denied (middleware redirects them to /my).
 */
function nursePageAllowed(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/my" || pathname.startsWith("/my/")) return true;
  return false;
}

export function authorize(
  pathname: string,
  method: Method,
  role: Role
): Decision {
  // Managers may do everything.
  if (role === "manager") return "allow";

  const upperMethod = (method || "GET").toUpperCase();

  if (isApiPath(pathname)) {
    for (const rule of NURSE_RULES) {
      if (rule.pattern.test(pathname)) {
        if (rule.methods.includes("*") || rule.methods.includes(upperMethod)) {
          return rule.decision;
        }
        // Matched the path but not the method (e.g. PUT on a nurse-readable
        // collection) → deny. First-match-wins stops here.
        return "deny";
      }
    }
    return "deny";
  }

  // Non-API pages.
  return nursePageAllowed(pathname) ? "allow" : "deny";
}
