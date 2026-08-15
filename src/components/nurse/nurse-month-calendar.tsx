"use client";

import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isToday,
  isWeekend,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NurseDay, NurseShift } from "@/lib/nurse/schedule-helpers";

/**
 * Read-only month calendar for the nurse portal. Adapts the manager
 * staff-calendar's visual language — forest-green day chips, ink-navy night
 * chips, leave marked — but is prop-driven (parent owns the fetch + month
 * state) and mobile-first. Tapping a day with shifts calls onSelectShift so the
 * parent can open the shift detail sheet.
 */

interface NurseMonthCalendarProps {
  days: NurseDay[];
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectShift: (shift: NurseShift) => void;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: "Vac",
  sick: "Sick",
  maternity: "Mat",
  medical: "Med",
  personal: "Pers",
  bereavement: "Ber",
  other: "Leave",
};

export function NurseMonthCalendar({
  days,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  onSelectShift,
}: NurseMonthCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({
    start: monthStart,
    end: endOfMonth(currentMonth),
  });
  const firstDayOfWeek = monthStart.getDay();

  const dayDataMap = new Map<string, NurseDay>();
  for (const d of days) dayDataMap.set(d.date, d);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h3 className="text-base font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 bg-muted">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={i}
              className="px-1 py-1.5 text-center text-[10px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[56px] border-t border-r border-border bg-muted/30"
            />
          ))}

          {calendarDays.map((date) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dayData = dayDataMap.get(dateStr);
            const today = isToday(date);
            const weekend = isWeekend(date);
            const firstShift = dayData?.shifts[0];

            return (
              <button
                type="button"
                key={dateStr}
                disabled={!firstShift}
                onClick={() => firstShift && onSelectShift(firstShift)}
                className={cn(
                  "min-h-[56px] border-t border-r border-border p-1 text-left align-top transition-colors",
                  weekend && "bg-muted/20",
                  firstShift
                    ? "cursor-pointer hover:bg-accent"
                    : "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-[10px] font-medium",
                    today
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {format(date, "d")}
                </div>

                {dayData?.leave && (
                  <div className="mb-0.5 rounded bg-green-100 px-1 py-px text-[9px] text-green-800 dark:bg-green-900/40 dark:text-green-300">
                    {LEAVE_TYPE_LABELS[dayData.leave.leaveType] ??
                      dayData.leave.leaveType}
                  </div>
                )}

                {dayData?.shifts.map((s) => (
                  <div
                    key={s.assignmentId}
                    className={cn(
                      "mb-0.5 truncate rounded px-1 py-px text-[9px] font-medium text-white",
                      // cancelled = released by approved leave; render like a
                      // callout (red + struck) so the nurse sees the shift is
                      // no longer theirs, next to the green leave chip.
                      s.status === "called_out" || s.status === "cancelled"
                        ? "bg-destructive/80 line-through"
                        : s.shiftType === "day"
                          ? "bg-[#2d5a4a]"
                          : s.shiftType === "night"
                            ? "bg-[#1a2332]"
                            : "bg-gray-500",
                    )}
                  >
                    {s.shiftType === "day"
                      ? "Day"
                      : s.shiftType === "night"
                        ? "Night"
                        : "Eve"}
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded bg-[#2d5a4a]" /> Day
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded bg-[#1a2332]" /> Night
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded bg-green-500" /> Leave
        </span>
      </div>
    </div>
  );
}

export { addMonths, subMonths };
