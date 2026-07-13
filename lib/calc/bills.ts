import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  getDaysInMonth,
  isWithinInterval,
  setDate,
  setMonth,
  startOfMonth,
} from "date-fns";
import type { Bill } from "@/lib/supabase/types";

function clampToMonth(monthStart: Date, day: number): Date {
  const daysInMonth = getDaysInMonth(monthStart);
  return setDate(monthStart, Math.min(day, daysInMonth));
}

/** Returns every due date for a bill that falls within [rangeStart, rangeEnd]. */
export function getBillOccurrences(bill: Bill, rangeStart: Date, rangeEnd: Date): Date[] {
  const interval = { start: rangeStart, end: rangeEnd };

  if (bill.frequency === "one_time") {
    if (!bill.due_date) return [];
    const date = new Date(bill.due_date);
    return isWithinInterval(date, interval) ? [date] : [];
  }

  if (bill.frequency === "weekly" || bill.frequency === "biweekly") {
    if (!bill.due_date) return [];
    const anchor = new Date(bill.due_date);
    const stepDays = bill.frequency === "weekly" ? 7 : 14;
    const daysSinceAnchor = differenceInCalendarDays(rangeStart, anchor);
    const stepsToCatchUp = Math.max(Math.floor(daysSinceAnchor / stepDays), 0);
    let cursor = addDays(anchor, stepsToCatchUp * stepDays);
    while (cursor < rangeStart) cursor = addDays(cursor, stepDays);

    const dates: Date[] = [];
    while (cursor <= rangeEnd) {
      if (cursor >= anchor) dates.push(cursor);
      cursor = addDays(cursor, stepDays);
    }
    return dates;
  }

  if (bill.frequency === "monthly") {
    const day = bill.due_day ?? 1;
    const dates: Date[] = [];
    let month = startOfMonth(rangeStart);
    while (month <= rangeEnd) {
      const date = clampToMonth(month, day);
      if (isWithinInterval(date, interval)) dates.push(date);
      month = addMonths(month, 1);
    }
    return dates;
  }

  if (bill.frequency === "yearly") {
    if (!bill.due_date) return [];
    const anchor = new Date(bill.due_date);
    const dates: Date[] = [];
    let year = setMonth(startOfMonth(rangeStart), anchor.getMonth());
    year = setDate(year, Math.min(anchor.getDate(), getDaysInMonth(year)));
    while (year <= rangeEnd) {
      if (isWithinInterval(year, interval)) dates.push(year);
      year = addYears(year, 1);
    }
    return dates;
  }

  return [];
}
