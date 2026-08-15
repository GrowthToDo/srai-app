/**
 * fetchJson exists so a single failed request can never strand a page in
 * "Loading..." (the live-demo bug of 2026-08-15): every path must end in
 * data or a thrown error. These tests pin the retry contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJson, FetchJsonError } from "@/lib/fetch-json";

const realFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }]));
    await expect(fetchJson("/api/staff")).resolves.toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 5xx and succeeds", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 502))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(fetchJson("/api/staff")).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("retries once on a network error and succeeds", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(fetchJson("/api/staff")).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("throws after the retry also fails — never hangs", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "down" }, 503));
    await expect(fetchJson("/api/staff")).rejects.toThrow(FetchJsonError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("does NOT retry a 4xx — the server answered", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "nope" }, 404));
    await expect(fetchJson("/api/staff")).rejects.toThrow("failed (404)");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
