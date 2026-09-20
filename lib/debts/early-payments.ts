import { addMonths } from "date-fns";
import { getDebtOccurrences, type Obligation } from "../calc/obligations";
import { minimumPayment } from "./minimum";
import { sum } from "../calc/money";
import type { Debt, DebtPayment, DebtSegment } from "../supabase/types";

/**
 * A logged payment tells the app something a due-day schedule can't know on
 * its own: this cycle's minimum already left the account. Without this, a
 * card paid ahead of its due date keeps showing that cycle's obligation as
 * still owed — still reserved against a future paycheck, still offered up
 * for assignment — even though the money is already gone.
 *
 * The match is deliberately simple: every dollar logged against a debt goes
 * into one pool, and the pool is spent against that debt's upcoming due-day
 * occurrences in order, oldest first, until it runs out. A logged $150 today
 * against a $150/mo minimum covers the very next occurrence — whichever
 * paycheck it happened to be assigned to — not the one that already passed
 * unlogged (this app has no way to know whether that one was paid outside
 * it, so it never guesses backward, only forward from today).
 */

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** This debt's upcoming due-day occurrences a logged payment already covers. */
export function coveredOccurrenceDates(
  debt: Debt,
  payments: DebtPayment[],
  segments: DebtSegment[] = [],
  today: Date = new Date()
): Set<string> {
  if (debt.type === "bnpl") return new Set();

  const todayIso = iso(today);
  const pool = sum(
    payments.filter((p) => p.debt_id === debt.id && p.paid_on <= todayIso).map((p) => p.amount)
  );
  if (pool <= 0) return new Set();

  // A year and a half of future occurrences is far more than one payment
  // pool could ever cover, and cheap to generate.
  const occurrences = getDebtOccurrences(debt, today, addMonths(today, 18), segments);

  const covered = new Set<string>();
  let remaining = pool;
  for (const occurrence of occurrences) {
    const due = minimumPayment(debt, segments, occurrence);
    if (due <= 0) continue;
    if (remaining + 1e-6 < due) break;
    remaining -= due;
    covered.add(iso(occurrence));
  }
  return covered;
}

/**
 * Drops obligation occurrences a logged payment already covers. Every screen
 * that lists what a paycheck still owes has to run through this, or a debt
 * paid early keeps double-billing: once for real, today, and again on
 * whatever paycheck it was — or still is — assigned to.
 */
export function withoutEarlyPaidOccurrences(
  obligations: Obligation[],
  debts: Debt[],
  payments: DebtPayment[],
  segments: DebtSegment[] = [],
  today: Date = new Date()
): Obligation[] {
  if (payments.length === 0) return obligations;
  const coveredByDebt = new Map(
    debts.map((d) => [d.id, coveredOccurrenceDates(d, payments, segments, today)])
  );
  return obligations.filter((ob) => {
    if (ob.type !== "debt") return true;
    return !coveredByDebt.get(ob.id)?.has(ob.date);
  });
}
