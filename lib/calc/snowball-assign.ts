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
 * The date each debt stops costing anything, given the extra payments assigned
 * to it. Paying a debt off has to actually end it: otherwise the plan promises
 * "this clears it" and then keeps charging the installment on later paychecks,
 * understating what's free and hiding the whole reward for paying it off.
 *
 * Only a payment that covers the full payoff clears a debt — a partial one
 * lowers the balance but the schedule carries on. Returns debt id → the payday
 * it's cleared on; obligations after that date should be dropped.
 */
export function clearedDatesFromAssignments(
  debts: { id: string; payoff: number }[],
  assigned: { debtId: string; amount: number; paycheckDate: string }[]
): Map<string, string> {
  const cleared = new Map<string, string>();
  const byDebt = new Map<string, { amount: number; paycheckDate: string }[]>();
  for (const a of assigned) {
    byDebt.set(a.debtId, [...(byDebt.get(a.debtId) ?? []), a]);
  }

  for (const debt of debts) {
    const payments = (byDebt.get(debt.id) ?? []).sort((a, b) =>
      a.paycheckDate.localeCompare(b.paycheckDate)
    );
    let paid = 0;
    for (const p of payments) {
      paid = round2(paid + p.amount);
      if (paid >= debt.payoff - 0.005) {
        cleared.set(debt.id, p.paycheckDate);
        break;
      }
    }
  }
  return cleared;
}

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
  options: {
    cushion?: number;
    maxSuggestions?: number;
    /** Don't suggest before this calendar day. Defaults to today. */
    notBefore?: string;
    /**
     * Payments already assigned. An assignment is a plan, not a payment, so the
     * debt's balance hasn't moved yet — without this a debt that's already
     * fully covered gets suggested all over again.
     */
    assigned?: { debtId: string; amount: number }[];
  } = {}
): SnowballSuggestion[] {
  const { cushion = 100, maxSuggestions = 3, notBefore, assigned = [] } = options;
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
  // Remaining payoff per debt, less anything already earmarked for it, then
  // drawn down as further suggestions consume it.
  const earmarked = new Map<string, number>();
  for (const a of assigned) {
    earmarked.set(a.debtId, (earmarked.get(a.debtId) ?? 0) + a.amount);
  }
  const remaining = targets.map((t) => ({
    ...t,
    balance: round2(Math.max(t.balance - (earmarked.get(t.id) ?? 0), 0)),
  }));
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

    // One extra payment per month, on one paycheck. If any paycheck this month
    // already carries one, the month is settled — don't go hunting for another
    // paycheck to spend the rest of the budget on.
    if (sum(monthEntries.map((e) => e.snowballTotal)) > 0) continue;

    // Real slack, and not a paycheck already received.
    const candidates = monthEntries.filter(
      (e) => e.freeToSpend > cushion && e.date >= floorDate
    );
    if (candidates.length === 0) continue;
    const budget = monthlyTarget;

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
