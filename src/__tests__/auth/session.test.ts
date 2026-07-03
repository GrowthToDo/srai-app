/**
 * Unit tests for src/lib/auth/session.ts — the runtime-agnostic (Web Crypto)
 * session token layer. Web Crypto (globalThis.crypto.subtle) is available under
 * vitest's node environment, so no polyfill is needed here.
 */
import { describe, it, expect } from "vitest";
import {
  signSession,
  verifySession,
  shouldReissue,
  SESSION_DURATION_MS,
  type SessionPayload,
} from "@/lib/auth/session";

const SECRET = "test-secret-key";

function freshPayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    uid: "user-123",
    role: "manager",
    staffId: null,
    exp: Date.now() + SESSION_DURATION_MS,
    ...overrides,
  };
}

describe("session sign/verify", () => {
  it("roundtrips a valid payload", async () => {
    const payload = freshPayload({ role: "nurse", staffId: "staff-9" });
    const token = await signSession(payload, SECRET);
    const verified = await verifySession(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe("user-123");
    expect(verified?.role).toBe("nurse");
    expect(verified?.staffId).toBe("staff-9");
    expect(verified?.exp).toBe(payload.exp);
  });

  it("returns null for a tampered payload", async () => {
    const token = await signSession(freshPayload(), SECRET);
    const [encodedPayload, sig] = token.split(".");
    // Flip a character in the payload; the signature no longer matches.
    const tamperedPayload =
      encodedPayload.slice(0, -1) +
      (encodedPayload.slice(-1) === "A" ? "B" : "A");
    const tampered = `${tamperedPayload}.${sig}`;
    expect(await verifySession(tampered, SECRET)).toBeNull();
  });

  it("returns null for a tampered signature", async () => {
    const token = await signSession(freshPayload(), SECRET);
    const [encodedPayload, sig] = token.split(".");
    const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === "A" ? "B" : "A");
    expect(await verifySession(`${encodedPayload}.${tamperedSig}`, SECRET)).toBeNull();
  });

  it("returns null for an expired payload", async () => {
    const token = await signSession(freshPayload({ exp: Date.now() - 1000 }), SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("returns null when verified with the wrong secret", async () => {
    const token = await signSession(freshPayload(), SECRET);
    expect(await verifySession(token, "a-different-secret")).toBeNull();
  });

  it("returns null for malformed tokens", async () => {
    expect(await verifySession("", SECRET)).toBeNull();
    expect(await verifySession("no-dot-here", SECRET)).toBeNull();
    expect(await verifySession("a.b.c", SECRET)).toBeNull();
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession(null, SECRET)).toBeNull();
  });

  it("produces a token under 512 bytes", async () => {
    const token = await signSession(
      freshPayload({ role: "nurse", staffId: "staff-9" }),
      SECRET
    );
    expect(token.length).toBeLessThan(512);
  });
});

describe("shouldReissue", () => {
  it("is false for a freshly issued cookie", () => {
    expect(shouldReissue(freshPayload())).toBe(false);
  });

  it("is true once the cookie is older than ~1 day", () => {
    // A cookie issued 2 days ago has exp = (issued + 30d) = now + 28d.
    const twoDaysAgoExp = Date.now() + SESSION_DURATION_MS - 2 * 24 * 60 * 60 * 1000;
    expect(shouldReissue(freshPayload({ exp: twoDaysAgoExp }))).toBe(true);
  });
});
