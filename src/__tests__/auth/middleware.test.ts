/**
 * Unit tests for src/middleware.ts — the Edge route guard.
 *
 * AUTH_ENABLED / AUTH_SCOPE are read at module scope, so each test that needs
 * a specific combination sets process.env, calls vi.resetModules(), and
 * dynamically imports the module fresh (mirrors how this repo isolates other
 * module-scope env reads under vitest).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from "@/lib/auth/session";

const SECRET = "test-secret-key";
const ORIGIN = "http://localhost:3000";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadMiddleware(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import("@/middleware");
}

function makeRequest(
  path: string,
  opts: {
    method?: string;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookie)
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.cookie}`);
  return new NextRequest(new URL(path, ORIGIN), {
    method: opts.method ?? "GET",
    headers,
  });
}

async function nurseToken(): Promise<string> {
  return signSession(
    {
      uid: "user-nurse-1",
      role: "nurse",
      staffId: "staff-9",
      exp: Date.now() + SESSION_DURATION_MS,
    },
    SECRET,
  );
}

describe("middleware — AUTH_SCOPE=nurse_only", () => {
  it("no cookie + GET /dashboard passes through AND strips spoofed identity headers", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: "nurse_only",
    });

    const request = makeRequest("/dashboard", {
      headers: {
        "x-user-id": "spoofed-uid",
        "x-user-role": "manager",
        "x-staff-id": "spoofed-staff",
      },
    });
    const response = await middleware(request);

    // Passed through (not a redirect / not a 401 JSON).
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();

    // The forwarded request must not carry the spoofed identity headers.
    expect(response.headers.get("x-middleware-request-x-user-id")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-user-role")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-staff-id")).toBeNull();
  });

  it("no cookie + GET /my redirects to /login?next=/my", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: "nurse_only",
    });

    const response = await middleware(makeRequest("/my"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/my");
  });

  it("no cookie + GET /api/my/notifications returns 401 JSON", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: "nurse_only",
    });

    const response = await middleware(makeRequest("/api/my/notifications"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("valid nurse session + GET /my is allowed with identity headers set", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: "nurse_only",
    });

    const token = await nurseToken();
    const response = await middleware(makeRequest("/my", { cookie: token }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-user-id")).toBe(
      "user-nurse-1",
    );
    expect(response.headers.get("x-middleware-request-x-user-role")).toBe(
      "nurse",
    );
    expect(response.headers.get("x-middleware-request-x-staff-id")).toBe(
      "staff-9",
    );
  });

  it("valid nurse session + GET /dashboard still redirects to /my (existing deny preserved)", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: "nurse_only",
    });

    const token = await nurseToken();
    const response = await middleware(
      makeRequest("/dashboard", { cookie: token }),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/my");
  });
});

describe("middleware — AUTH_SCOPE unset (mode off)", () => {
  it("no cookie + GET /dashboard redirects to /login (old fully-gated behavior)", async () => {
    const { middleware } = await loadMiddleware({
      AUTH_ENABLED: "true",
      AUTH_SCOPE: undefined,
    });

    const response = await middleware(makeRequest("/dashboard"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });
});
