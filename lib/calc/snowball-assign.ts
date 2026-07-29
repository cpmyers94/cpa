import { sum } from "./money";
import type { PaycheckPlanEntry } from "./paycheck-plan";

/**
 * Picking the right paycheck for an extra debt payment.
 *
 * A snowball payment is a lump, not a fixed slice of every paycheck — and which
 * paycheck it comes from matters. Paychecks are lumpy: one may carry rent plus
 * two loan payments while the next carries almost nothing. Taking the snowball
 * from a heavy paycheck is how a required payment ends up late, and "the card is
 * paid off but the car payment bounced" is not a win.
 *
 * So: aim at the paycheck in each month with the most slack after everything it
 * already owes, and never take so much that it drops below a cushion. Because
 * obligations assigned to a paycheck are already subtracted before free-to-spend
 * is computed, spending only out of free-to-spend can't starve them.
 */

export interface SnowballTarget {
  id: string;
  name: string;
  /** What it costs to clear this debt today. */
  balance: number;
}

export interface SnowballSuggestion {
  incomeSourceId: string;
  incomeSourceName: string;
  /** Paycheck (yyyy-mm-dd) this payment should come from. */
  date: string;
  amount: number;
  targetId: string;
  targetName: string;
  /** True when this payment clears the debt outright. */
  paysOff: boolean;
  /** Plain-language reason this paycheck was chosen. */
  reason: string;
  /** Free-to-spend on that paycheck before the payment. */
  freeBefore: number;
  /** Free-to-spend after — never below the cushion. */
  freeAfter: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * Recommends one snowball payment per calendar month, on the paycheck best able
 * to absorb it.
 *
 * `monthlyTarget` is the month's total extra-toward-debt budget; `cushion` is
 * the breathing room a paycheck must keep. Paychecks that already have a
 * snowball payment assigned are skipped, so accepted suggestions don't get
 * re-suggested. Returns at most one suggestion per month, soonest first.
 */
export function suggestSnowballPayments(
  entries: PaycheckPlanEntry[],
  targets: SnowballTarget[],
  monthlyTarget: number,
  cushion = 100,
  maxSuggestions = 3,
  /** Don't suggest before this calendar day. Defaults to today. */
  notBefore?: string
): SnowballSuggestion[] {
  if (monthlyTarget <= 0 || targets.length === 0) return [];

  // A paycheck already in hand is largely spent — suggesting an extra payment
  // out of it is advice about the past. Only look at today's and later paydays.
  // Already-assigned payments still show; this only gates new suggestions.
  const now = new Date();
  const floorDate =
    notBefore ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  // Remaining payoff per debt, drawn down as suggestions consume it.
  const remaining = targets.map((t) => ({ ...t }));
  let targetIndex = 0;

  // Group every paycheck by month — a payment already assigned to a past
  // paycheck still spends that month's budget — but only offer future ones.
  const byMonth = new Map<string, PaycheckPlanEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }

  const suggestions: SnowballSuggestion[] = [];

  for (const month of [...byMonth.keys()].sort()) {
    if (suggestions.length >= maxSuggestions) break;
    const monthEntries = byMonth.get(month) ?? [];

    // Already committed extra on this month's paychecks counts against the budget.
    const committed = sum(monthEntries.map((e) => e.snowballTotal));
    const budget = round2(monthlyTarget - committed);
    if (budget <= 0) continue;

    // Real slack, not already carrying a payment, and not already received.
    const candidates = monthEntries.filter(
      (e) => e.snowballTotal === 0 && e.freeToSpend > cushion && e.date >= floorDate
    );
    if (candidates.length === 0) continue;

    // The most slack wins; ties go to the earlier paycheck so debt is hit sooner.
    const best = candidates.reduce((a, b) =>
      b.freeToSpend > a.freeToSpend || (b.freeToSpend === a.freeToSpend && b.date < a.date)
        ? b
        : a
    );

    while (targetIndex < remaining.length && remaining[targetIndex].balance <= 0.005) {
      targetIndex += 1;
    }
    if (targetIndex >= remaining.length) break;
    const target = remaining[targetIndex];

    const affordable = round2(best.freeToSpend - cushion);
    const amount = round2(Math.min(budget, affordable, target.balance));
    if (amount <= 0) continue;

    const paysOff = amount >= target.balance - 0.005;
    target.balance = round2(target.balance - amount);

    // Only cite upcoming paychecks as the alternatives — a past one isn't a choice.
    const others = monthEntries.filter((e) => e.date !== best.date && e.date >= floorDate);
    const reason =
      others.length === 0
        ? "Only paycheck this month."
        : `Most room this month — ${others
            .map((e) => `${e.date.slice(5)} has $${Math.max(Math.round(e.freeToSpend), 0)}`)
            .join(", ")} free.`;

    suggestions.push({
      incomeSourceId: best.incomeSourceId,
      incomeSourceName: best.incomeSourceName,
      date: best.date,
      amount,
      targetId: target.id,
      targetName: target.name,
      paysOff,
      reason,
      freeBefore: best.freeToSpend,
      freeAfter: round2(best.freeToSpend - amount),
    });
  }

  return suggestions;
}
