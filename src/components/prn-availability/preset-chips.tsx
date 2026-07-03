"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { datesForWeekdays, togglePreset } from "@/lib/prn-availability";

interface PresetChipsProps {
  selected: Date[];
  onChange: (dates: Date[]) => void;
  from: Date;
  to: Date;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

const DAY_CHIPS: { label: string; weekday: number }[] = [
  { label: "Mon", weekday: 1 },
  { label: "Tue", weekday: 2 },
  { label: "Wed", weekday: 3 },
  { label: "Thu", weekday: 4 },
  { label: "Fri", weekday: 5 },
  { label: "Sat", weekday: 6 },
  { label: "Sun", weekday: 0 },
];

/**
 * Mass-select preset chips for the PRN availability multi-date calendars.
 * Row 1: whole-window presets (any day / weekdays / weekends / clear). Row 2:
 * single-weekday toggles. Each preset chip (except Clear) toggles: if every
 * date in the preset is already selected it removes them, otherwise it adds
 * whatever is missing — see `togglePreset` in `@/lib/prn-availability`.
 */
export function PresetChips({
  selected,
  onChange,
  from,
  to,
}: PresetChipsProps) {
  const selectedIsoSet = new Set(
    selected.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  );

  function isPresetActive(weekdays: number[]): boolean {
    const presetDates = datesForWeekdays(weekdays, from, to);
    if (presetDates.length === 0) return false;
    return presetDates.every((d) =>
      selectedIsoSet.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    );
  }

  function applyPreset(weekdays: number[]) {
    const presetDates = datesForWeekdays(weekdays, from, to);
    onChange(togglePreset(selected, presetDates));
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <PresetButton
          label="Any day"
          active={isPresetActive(ALL_DAYS)}
          onClick={() => applyPreset(ALL_DAYS)}
        />
        <PresetButton
          label="Weekdays"
          active={isPresetActive(WEEKDAYS)}
          onClick={() => applyPreset(WEEKDAYS)}
        />
        <PresetButton
          label="Weekends"
          active={isPresetActive(WEEKENDS)}
          onClick={() => applyPreset(WEEKENDS)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DAY_CHIPS.map(({ label, weekday }) => (
          <PresetButton
            key={label}
            label={label}
            active={isPresetActive([weekday])}
            onClick={() => applyPreset([weekday])}
          />
        ))}
      </div>
    </div>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn(active && "pointer-events-auto")}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
