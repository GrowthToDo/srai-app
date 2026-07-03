import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Node-only password hashing (scrypt). NEVER import this from middleware — it
 * pulls in node:crypto, which is unavailable in the Edge runtime. Middleware
 * uses src/lib/auth/session.ts (Web Crypto) instead.
 *
 * Stored format is self-describing: "saltHex:derivedKeyHex" (16-byte salt,
 * 64-byte derived key). No separate params column needed for Phase 1.
 */

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = scryptSync(password, salt, KEY_BYTES);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, keyHex] = parts;
  if (!saltHex || !keyHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  // A malformed hex string yields the wrong byte length; reject before scrypt.
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

  let derivedKey: Buffer;
  try {
    derivedKey = scryptSync(password, salt, KEY_BYTES);
  } catch {
    return false;
  }
  if (derivedKey.length !== expected.length) return false;
  return timingSafeEqual(derivedKey, expected);
}
