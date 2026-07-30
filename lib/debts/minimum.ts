import { sum } from "../calc/money";
import { aprOn, debtParts, type DebtPart } from "./segments";
import type { Debt, DebtSegment, MinimumRule } from "../supabase/types";

/**
 * What the card asks for this month.
 *
 * An issuer computes the minimum from the balance — usually a small percentage
 * of it plus the interest that accrued, floored at $25–35. A typed-in figure
 * gets two things wrong: it doesn't fall as the balance falls, and on a card
 * carrying a 0% promo it doesn't jump when the promo lapses and the whole
 * balance starts accruing. That jump is the part that hurts, because it lands
 * on a paycheck that was never planned for it.
 *
 * Every reader of a minimum goes through here, so the number on a paycheck, in
 * the projection, and in the surplus can't disagree.
 */

export const DEFAULT_MINIMUM_PERCENT = 1;
export const DEFAULT_MINIMUM_FLOOR = 25;

export const MINIMUM_RULES: { value: MinimumRule; label: string; hint: string }[] = [
  {
    value: "manual",
    label: "I'll enter it",
    hint: "A fixed amount you type in.",
  },
  {
    value: "percent_plus_interest",
    label: "% of balance + interest",
    hint: "The most common card formula — 1% of the balance plus the month's interest.",
  },
  {
    value: "percent_of_balance",
    label: "% of balance",
    hint: "A flat percentage of the balance, interest included in it.",
  },
];

/** This month's interest across a card's buckets, each at its own rate. */
export function monthlyInterest(parts: DebtPart[], on: Date): number {
  return sum(parts.map((p) => (p.balance * aprOn(p, on)) / 100 / 12));
}

/**
 * The minimum due on a debt for the month containing `on`. BNPL plans have a
 * fixed installment rather than a minimum, so they're left alone.
 */
export function minimumPayment(
  debt: Debt,
  segments: DebtSegment[] = [],
  on: Date = new Date()
): number {
  if (debt.type === "bnpl") return debt.minimum_payment;
  if (debt.minimum_rule === "manual") return debt.minimum_payment;

  const parts = debtParts(debt, segments);
  return minimumFromParts(debt, parts, on);
}

/**
 * The same formula against balances the caller already holds — used by the
 * payoff simulation, where the balances shrink month to month and a minimum
 * frozen at today's balance would overstate every later payment.
 */
export function minimumFromParts(
  debt: { minimum_rule: MinimumRule; minimum_percent: number | null; minimum_floor: number | null; minimum_payment: number },
  parts: DebtPart[],
  on: Date
): number {
  const balance = sum(parts.map((p) => p.balance));
  if (balance <= 0) return 0;
  if (debt.minimum_rule === "manual") return debt.minimum_payment;

  const percent = debt.minimum_percent ?? DEFAULT_MINIMUM_PERCENT;
  const floor = debt.minimum_floor ?? DEFAULT_MINIMUM_FLOOR;
  const base = (balance * percent) / 100;
  const due =
    debt.minimum_rule === "percent_plus_interest" ? base + monthlyInterest(parts, on) : base;

  // Never ask for more than is owed — the last payment is whatever's left.
  return round2(Math.min(Math.max(due, floor), balance));
}

/**
 * What the minimum becomes once every promo rate on the card has lapsed. On a
 * card with a large 0% balance this is materially higher than today's minimum,
 * and it arrives on a single paycheck with no warning unless it's shown.
 */
export function minimumAfterPromos(
  debt: Debt,
  segments: DebtSegment[] = []
): { amount: number; risesOn: string } | null {
  if (debt.type === "bnpl" || debt.minimum_rule === "manual") return null;
  const parts = debtParts(debt, segments);
  const promos = parts.filter(
    (p) => p.promoEndsOn && p.postPromoApr != null && p.balance > 0
  );
  if (promos.length === 0) return null;

  const last = promos
    .map((p) => p.promoEndsOn as string)
    .sort()
    .at(-1) as string;
  // A day past the final promo date, so every one of them has reverted.
  const [y, m, d] = last.split("-").map(Number);
  const after = new Date(y, m - 1, d + 1);

  return { amount: minimumFromParts(debt, parts, after), risesOn: last };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
