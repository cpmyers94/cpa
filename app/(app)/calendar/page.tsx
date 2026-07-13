import Link from "next/link";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/supabase/user";
import { Card } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import { getBillOccurrences } from "@/lib/calc/bills";
import type { Bill, IncomeSource } from "@/lib/supabase/types";

type DayEvent = { label: string; amount: number; kind: "pay" | "bill" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { supabase, user } = await requireUser();
  const { month } = await searchParams;

  const monthStart = startOfMonth(month ? new Date(`${month}-01`) : new Date());
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const [{ data: incomeSources }, { data: bills }] = await Promise.all([
    supabase.from("income_sources").select("*").eq("user_id", user.id).eq("active", true),
    supabase.from("bills").select("*").eq("user_id", user.id).eq("active", true),
  ]);

  const sources = (incomeSources ?? []) as IncomeSource[];
  const billList = (bills ?? []) as Bill[];

  const eventsByDay = new Map<string, DayEvent[]>();
  const pushEvent = (date: Date, event: DayEvent) => {
    const key = format(date, "yyyy-MM-dd");
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  };

  for (const source of sources) {
    for (const date of getPaycheckOccurrences(source, gridStart, gridEnd)) {
      pushEvent(date, { label: source.name, amount: source.gross_amount, kind: "pay" });
    }
  }
  for (const bill of billList) {
    for (const date of getBillOccurrences(bill, gridStart, gridEnd)) {
      pushEvent(date, { label: bill.name, amount: bill.amount, kind: "bill" });
    }
  }

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) days.push(d);

  const prevMonth = format(addMonths(monthStart, -1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">{format(monthStart, "MMMM yyyy")}</h2>
        <div className="flex gap-2 text-sm">
          <Link href={`?month=${prevMonth}`} className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
            ← Prev
          </Link>
          <Link href={`?month=${nextMonth}`} className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
            Next →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 text-xs dark:border-neutral-800 dark:bg-neutral-800">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-neutral-100 px-2 py-1 text-center font-medium text-neutral-500 dark:bg-neutral-900">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-24 bg-white p-1.5 dark:bg-neutral-900 ${
                isSameMonth(day, monthStart) ? "" : "opacity-40"
              }`}
            >
              <p className={`text-right text-[11px] ${isToday(day) ? "font-bold text-neutral-900 dark:text-white" : "text-neutral-400"}`}>
                {format(day, "d")}
              </p>
              <div className="mt-1 flex flex-col gap-0.5">
                {events.map((e, i) => (
                  <span
                    key={i}
                    className={`truncate rounded px-1 py-0.5 text-[10px] ${
                      e.kind === "pay"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                    title={`${e.label} · ${formatCurrency(e.amount)}`}
                  >
                    {e.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
