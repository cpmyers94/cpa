import { debtPayoff, type ScheduledExtra } from "../calc/debt-plan";
import type { Obligation } from "../calc/obligations";
import type { AssignedSnowballPayment } from "../calc/paycheck-plan";
import { clearedDatesFromAssignments } from "../calc/snowball-assign";
import type { Debt, DebtSegment, SnowballPayment } from "../supabase/types";

/**
 * Assigned extra payments are a source of truth that every debt calculation has
 * to respect, and bolting that onto each caller separately is how they drift:
 * a page that forgets keeps charging a debt that's been paid off, or projects a
 * payoff date that contradicts what the user committed to.
 *
 * Every conversion from stored assignments into what a calculation needs lives
 * here, so wiring up a new consumer is one import rather than a re-derivation.
 */

/** Assignments in the shape `buildPaycheckPlan` subtracts from each paycheck. */
export function toAssignedPayments(
  payments: SnowballPayment[],
  debts: Debt[]
): AssignedSnowballPayment[] {
  const nameOf = (id: string) => debts.find((d) => d.id === id)?.name.trim() ?? "debt";
  return payments.map((p) => ({
    id: p.id,
    incomeSourceId: p.income_source_id,
    paycheckDate: p.paycheck_date,
    targetName: nameOf(p.debt_id),
    amount: p.amount,
  }));
}

/**
 * Assignments in the shape `simulatePayoff` applies, as month offsets from
 * `from`. Month 1 is the first simulated month, so a payment this month or
 * already past lands on month 1 rather than dropping out of the projection.
 */
export function toScheduledExtras(
  payments: SnowballPayment[],
  from: Date = new Date()
): ScheduledExtra[] {
  return payments.map((p) => {
    const [year, month] = p.paycheck_date.split("-").map(Number);
    const offset = (year - from.getFullYear()) * 12 + (month - 1 - from.getMonth());
    return { debtId: p.debt_id, amount: p.amount, month: Math.max(offset, 1) };
  });
}

/**
 * Drops obligations for debts whose assigned payments clear them, from the
 * payday they're cleared on. A debt that's been paid off must stop costing
 * money on later paychecks, on every screen that shows it.
 */
export function withoutClearedDebts(
  obligations: Obligation[],
  debts: Debt[],
  payments: SnowballPayment[],
  segments: DebtSegment[] = []
): Obligation[] {
  if (payments.length === 0) return obligations;
  const cleared = clearedDatesFromAssignments(
    debts.map((d) => ({ id: d.id, payoff: debtPayoff(d, segments) })),
    payments.map((p) => ({
      debtId: p.debt_id,
      amount: p.amount,
      paycheckDate: p.paycheck_date,
    }))
  );
  if (cleared.size === 0) return obligations;
  return obligations.filter((ob) => {
    if (ob.type !== "debt") return true;
    const clearedOn = cleared.get(ob.id);
    return !clearedOn || ob.date <= clearedOn;
  });
}
