/**
 * Unit tests for POST /api/demo/reset and GET /api/demo/status.
 *
 * DEMO_MODE (and DEMO_RESET_SECRET) are read at module scope in the route
 * handlers, and the reset route also keeps a module-scope `lastResetAt`
 * rate-limit timestamp. Each test that needs a specific combination sets
 * process.env, calls vi.resetModules(), and dynamically imports the route
 * fresh — mirrors the env-isolation pattern in
 * src/__tests__/auth/middleware.test.ts. Resetting modules also gives every
 * test its own `lastResetAt`, so the 60s rate limit only fires within a
 * single test unless intentionally exercised across two calls.
 *
 * resetDemoData is mocked so these tests never run real generation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGIN = "http://localhost:3000";
const ORIGINAL_ENV = { ...process.env };

const resetDemoDataMock = vi.fn(async () => ({ staffCount: 0 }));
const getDemoResetEpochMock = vi.fn(
  (): string | null => "2026-07-06T00:00:00.000Z",
);

vi.mock("@/lib/demo/reset-demo", () => ({
  resetDemoData: () => resetDemoDataMock(),
  getDemoResetEpoch: () => getDemoResetEpochMock(),
}));

beforeEach(() => {
  resetDemoDataMock.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadRoutes(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  const resetRoute = await import("@/app/api/demo/reset/route");
  const statusRoute = await import("@/app/api/demo/status/route");
  return { POST: resetRoute.POST, GET: statusRoute.GET };
}

function makeResetRequest(
  opts: { headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL("/api/demo/reset", ORIGIN), {
    method: "POST",
    headers: new Headers(opts.headers ?? {}),
  });
}

describe("GET /api/demo/status", () => {
  it("DEMO_MODE unset -> {demo:false, resetAt:null} (epoch never leaks outside demo mode)", async () => {
    const { GET } = await loadRoutes({ DEMO_MODE: undefined });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ demo: false, resetAt: null });
  });

  it("DEMO_MODE=true -> {demo:true, resetAt:<epoch>}", async () => {
    const { GET } = await loadRoutes({ DEMO_MODE: "true" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      demo: true,
      resetAt: "2026-07-06T00:00:00.000Z",
    });
  });
});

describe("POST /api/demo/reset", () => {
  it("DEMO_MODE unset -> 404", async () => {
    const { POST } = await loadRoutes({ DEMO_MODE: undefined });
    const response = await POST(makeResetRequest());
    expect(response.status).toBe(404);
    expect(resetDemoDataMock).not.toHaveBeenCalled();
  });

  it("DEMO_MODE=true, no auth, foreign origin -> 401", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({ headers: { origin: "https://evil.example.com" } }),
    );
    expect(response.status).toBe(401);
    expect(resetDemoDataMock).not.toHaveBeenCalled();
  });

  it("DEMO_MODE=true, Bearer wrong-secret -> 401", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({ headers: { authorization: "Bearer wrong-secret" } }),
    );
    expect(response.status).toBe(401);
    expect(resetDemoDataMock).not.toHaveBeenCalled();
  });

  it("DEMO_MODE=true, Bearer correct -> 200 {ok:true}, resetDemoData called once", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({ headers: { authorization: "Bearer s3cr3t" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resetDemoDataMock).toHaveBeenCalledTimes(1);
  });

  it("second call within 60s -> 429", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const authedRequest = () =>
      makeResetRequest({ headers: { authorization: "Bearer s3cr3t" } });

    const first = await POST(authedRequest());
    expect(first.status).toBe(200);

    const second = await POST(authedRequest());
    expect(second.status).toBe(429);
    expect(resetDemoDataMock).toHaveBeenCalledTimes(1);
  });

  it("DEMO_MODE=true, same-origin (origin header == host) -> 200", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({ headers: { origin: ORIGIN } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resetDemoDataMock).toHaveBeenCalledTimes(1);
  });

  it("DEMO_MODE=true, origin matches x-forwarded-host (reverse proxy) -> 200", async () => {
    // Railway's proxy: nextUrl.host is container-internal, the public domain
    // arrives via x-forwarded-host. The banner's same-origin reset must pass.
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({
        headers: {
          origin: "https://public-demo.example.com",
          "x-forwarded-host": "public-demo.example.com",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(resetDemoDataMock).toHaveBeenCalledTimes(1);
  });

  it("DEMO_MODE=true, foreign origin not matching any request host -> 401", async () => {
    const { POST } = await loadRoutes({
      DEMO_MODE: "true",
      DEMO_RESET_SECRET: "s3cr3t",
    });
    const response = await POST(
      makeResetRequest({
        headers: {
          origin: "https://attacker.example.net",
          "x-forwarded-host": "public-demo.example.com",
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(resetDemoDataMock).not.toHaveBeenCalled();
  });
});
