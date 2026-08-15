"use client";

import { useEffect } from "react";

/**
 * Auto-recovery for the stale-tab-after-deploy failure mode.
 *
 * After a Railway deploy, a tab opened before the deploy still runs the old
 * client bundle; its navigation clicks try to fetch chunks/RSC payloads that
 * no longer exist, fail silently, and the whole UI appears dead until the
 * user hard-refreshes (bit the founder twice on the live demo — sidebar and
 * ribbon links both unresponsive). This listener detects the chunk-load
 * failure signature and performs the hard reload for them.
 *
 * The sessionStorage guard allows at most one automatic reload per 30s so a
 * genuinely broken deploy (chunks 404 even when fresh) degrades to the normal
 * broken state instead of a reload loop.
 */

const GUARD_KEY = "chunk-reload-at";
const GUARD_WINDOW_MS = 30_000;

function isChunkLoadFailure(message: string): boolean {
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (Date.now() - last < GUARD_WINDOW_MS) return;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — still better to reload than stay dead.
  }
  window.location.reload();
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.message ?? "")) reloadOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : ((reason as Error | undefined)?.message ??
            String((reason as Error | undefined)?.name ?? ""));
      if (isChunkLoadFailure(message)) reloadOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
