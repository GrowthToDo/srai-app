"use client";

/**
 * A small pulsing "do this next" dot for the first-cycle guide. Placed inside a
 * button (which must be `relative`) to mark the Generate or Publish action the
 * manager should take next. Renders nothing unless `show` — so call sites can
 * pass `guide?.dot === "generate"` directly.
 */
export function GuideDot({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <span
      className="absolute -top-2 -right-2 z-10 pointer-events-none flex h-4 w-4"
      title={label}
      aria-label={label}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:hidden" />
      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-primary ring-2 ring-white" />
    </span>
  );
}
