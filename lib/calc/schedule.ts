import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  getDaysInMonth,
  isWithinInterval,
  setDate,
  startOfMonth,
} from "date-fns";
import type { IncomeSource } from "@/lib/supabase/types";

/** Clamp a target day-of-month (1-31) to the last real day of that month. */
function clampToMonth(monthStart: Date, day: number): Date {
  const daysInMonth = getDaysInMonth(monthStart);
  return setDate(monthStart, Math.min(day, daysInMonth));
}

/**
 * Returns every paycheck date for an income source that falls within
 * [rangeStart, rangeEnd] (inclusive).
 */
export function getPaycheckOccurrences(
  source: Pick<IncomeSource, "frequency" | "anchor_date" | "semimonthly_days" | "monthly_day">,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const interval = { start: rangeStart, end: rangeEnd };

  if (source.frequency === "weekly" || source.frequency === "biweekly") {
    if (!source.anchor_date) return [];
    const anchor = new Date(source.anchor_date);
    const stepDays = source.frequency === "weekly" ? 7 : 14;

    const daysSinceAnchor = differenceInCalendarDays(rangeStart, anchor);
    const stepsToCatchUp = Math.floor(daysSinceAnchor / stepDays);
    let cursor = addDays(anchor, Math.max(stepsToCatchUp, 0) * stepDays);
    while (cursor < rangeStart) cursor = addDays(cursor, stepDays);

    const dates: Date[] = [];
    while (cursor <= rangeEnd) {
      if (cursor >= anchor && isWithinInterval(cursor, interval)) dates.push(cursor);
      cursor = source.frequency === "weekly" ? addWeeks(cursor, 1) : addDays(cursor, 14);
    }
    return dates;
  }

  if (source.frequency === "semimonthly") {
    const days = source.semimonthly_days?.length ? source.semimonthly_days : [1, 15];
    const dates: Date[] = [];
    let month = startOfMonth(rangeStart);
    while (month <= rangeEnd) {
      for (const day of days) {
        const date = clampToMonth(month, day);
        if (isWithinInterval(date, interval)) dates.push(date);
      }
      month = addMonths(month, 1);
    }
    return dates.sort((a, b) => a.getTime() - b.getTime());
  }

  if (source.frequency === "monthly") {
    const day = source.monthly_day ?? 1;
    const dates: Date[] = [];
    let month = startOfMonth(rangeStart);
    while (month <= rangeEnd) {
      const date = clampToMonth(month, day);
      if (isWithinInterval(date, interval)) dates.push(date);
      month = addMonths(month, 1);
    }
    return dates;
  }

  return [];
}

export function nextPaycheckDate(
  source: Pick<IncomeSource, "frequency" | "anchor_date" | "semimonthly_days" | "monthly_day">,
  from: Date = new Date()
): Date | null {
  const occurrences = getPaycheckOccurrences(source, from, addMonths(from, 3));
  return occurrences[0] ?? null;
}
