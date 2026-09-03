import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Wordmark + "duty wheel" logo, mirrored from the marketing site's
 * Logo.astro: three saffron arcs (morning / evening / night) on any ground.
 */
export function DutyWheel({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="7"
      />
      <path
        d="M24 7 A17 17 0 0 1 38.7 15.5"
        fill="none"
        stroke="#F5A623"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M38.7 32.5 A17 17 0 0 1 24 41"
        fill="none"
        stroke="#F5A623"
        strokeWidth="7"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M9.3 32.5 A17 17 0 0 1 9.3 15.5"
        fill="none"
        stroke="#F5A623"
        strokeWidth="7"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
    </svg>
  );
}

export function BrandMark({
  size = 24,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      translate="no"
      className={cn(
        "inline-flex items-center gap-2 font-bold tracking-tight whitespace-nowrap text-foreground",
        className,
      )}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      <DutyWheel size={size} />
      <span className={textClassName}>{APP_NAME}</span>
    </span>
  );
}
