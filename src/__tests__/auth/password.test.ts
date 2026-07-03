/**
 * Unit tests for src/lib/auth/password.ts — Node-only scrypt hashing.
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("s3cret");
    expect(verifyPassword("not-s3cret", hash)).toBe(false);
  });

  it("returns false for malformed stored values", () => {
    expect(verifyPassword("pw", "")).toBe(false);
    expect(verifyPassword("pw", "no-colon-here")).toBe(false);
    expect(verifyPassword("pw", "onlysalt:")).toBe(false);
    expect(verifyPassword("pw", ":onlykey")).toBe(false);
    expect(verifyPassword("pw", "too:many:colons")).toBe(false);
    expect(verifyPassword("pw", "zzzz:zzzz")).toBe(false); // non-hex
    // valid hex but wrong byte lengths
    expect(verifyPassword("pw", "abcd:abcd")).toBe(false);
  });

  it("produces a different salt (and hash) each call", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    // Both still verify.
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });
});
