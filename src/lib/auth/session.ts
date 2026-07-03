/**
 * Runtime-agnostic session tokens (Edge middleware + Node route handlers + vitest).
 *
 * HARD CONSTRAINT: this file must run in the Edge runtime. It uses ONLY Web
 * Crypto (crypto.subtle), TextEncoder/TextDecoder, and hand-rolled base64url.
 * NO node:crypto, NO Buffer, NO "@/db" imports. Do not add any.
 *
 * Token shape: `${base64url(json(payload))}.${base64url(hmac)}`
 * The HMAC is SHA-256 over the encoded-payload string, keyed by AUTH_SECRET.
 */

export interface SessionPayload {
  uid: string;
  role: "manager" | "nurse";
  staffId: string | null;
  /** Absolute expiry, unix milliseconds. */
  exp: number;
}

// Cookie contract — imported by middleware and the auth routes.
export const SESSION_COOKIE_NAME = "ssai_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_DURATION_MS = SESSION_MAX_AGE_SECONDS * 1000;

/** Reissue window: rotate the cookie once it is older than ~1 day. */
const REISSUE_AFTER_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Cookie attributes as a serialized string suffix (everything after
 * `name=value`). Secure is only set in production so http://localhost works.
 */
export function sessionCookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function getSecret(secret?: string): string {
  const s = secret ?? process.env.AUTH_SECRET;
  // A missing secret in dev (AUTH_ENABLED off) should not crash token helpers;
  // fall back to a fixed dev-only string. Production enforcement of a real
  // AUTH_SECRET lives in middleware module scope.
  return s && s.length > 0 ? s : "dev-insecure-secret";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- base64url helpers (byte-safe, no Buffer/atob dependency) ---

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i++) map[B64_ALPHABET[i]] = i;
  return map;
})();

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64UrlToBytes(input: string): Uint8Array | null {
  const len = input.length;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = input[i];
    const val = B64_LOOKUP[c];
    if (val === undefined) return null; // invalid character
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function encodeString(s: string): string {
  return bytesToBase64Url(encoder.encode(s));
}

// --- HMAC ---

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacBase64Url(data: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

// Constant-time-ish string compare (both operands are our own base64url output
// of fixed length, so length is not secret here).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Create a signed token. `payload.exp` should already be set by the caller
 * (login sets exp = now + SESSION_DURATION_MS).
 */
export async function signSession(
  payload: SessionPayload,
  secret?: string
): Promise<string> {
  const encodedPayload = encodeString(JSON.stringify(payload));
  const sig = await hmacBase64Url(encodedPayload, getSecret(secret));
  return `${encodedPayload}.${sig}`;
}

/**
 * Verify a token. Returns the payload, or null for a bad signature, malformed
 * token, or an expired payload.
 */
export async function verifySession(
  token: string | undefined | null,
  secret?: string
): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const encodedPayload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  // A second separator means a tampered/garbage token.
  if (providedSig.indexOf(".") !== -1) return null;

  const expectedSig = await hmacBase64Url(encodedPayload, getSecret(secret));
  if (!safeEqual(providedSig, expectedSig)) return null;

  const bytes = base64UrlToBytes(encodedPayload);
  if (!bytes) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.uid !== "string" ||
    (payload.role !== "manager" && payload.role !== "nurse") ||
    (payload.staffId !== null && typeof payload.staffId !== "string") ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp <= Date.now()) return null;

  return payload;
}

/**
 * True when the cookie is older than ~1 day, so middleware should rotate it.
 * We infer age from exp: a fresh cookie has exp ≈ now + 30d, so
 * (exp - 29d) is the moment it becomes older than 1 day.
 */
export function shouldReissue(payload: SessionPayload): boolean {
  const issuedRoughly = payload.exp - SESSION_DURATION_MS;
  return Date.now() - issuedRoughly > REISSUE_AFTER_MS;
}
