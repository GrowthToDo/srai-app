/**
 * fetchJson — the client-side fetch wrapper for page data loads.
 *
 * Exists because naked `fetch(...).then(r => r.json())` in page components
 * left "Loading..." states hanging forever whenever a request failed once —
 * e.g. a transient 502 while Railway restarts the container on deploy, or the
 * server briefly unresponsive while a synchronous better-sqlite3 import runs
 * (the founder hit both on the live demo, 2026-08-15). Every failure mode
 * must end in either data or a thrown error the page can render — never a
 * silent hang.
 *
 * Behavior: 15s timeout per attempt, one automatic retry (after a short
 * delay) on network errors / timeouts / 5xx, then a descriptive Error.
 * 4xx never retries — the server answered; retrying won't change its mind.
 */

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;

export class FetchJsonError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchJsonError";
  }
}

async function attempt<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new FetchJsonError(
      `Request to ${url} failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await attempt<T>(url, init);
  } catch (err) {
    const status = err instanceof FetchJsonError ? err.status : undefined;
    // 4xx is a real answer, not a glitch — surface it immediately.
    if (status !== undefined && status < 500) throw err;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return attempt<T>(url, init);
  }
}
