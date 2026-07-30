import { sum } from "../calc/money";
import { cardBalance } from "./segments";
import type { Debt, DebtSegment } from "../supabase/types";

/**
 * Credit utilization — what a card reports owed against its limit.
 *
 * It's the fastest-moving part of a credit score, because it carries no
 * history: each cycle the score is recomputed from whatever the cards report
 * right then. Paying a balance down shows up in weeks, unlike a late payment
 * that lingers for years. That makes it the one lever a plan can pull now.
 *
 * Two figures matter and they move differently. Per-card utilization responds
 * to paying down *one* card, so the cheapest win is the card closest to the
 * target. Aggregate utilization is every balance over every limit, and to that
 * one a dollar is a dollar wherever it lands.
 */

export const DEFAULT_UTILIZATION_TARGET = 30;

/**
 * The next thing worth buying on this card. Getting back under the limit is a
 * separate, far cheaper milestone than getting to the target, and it's worth
 * more per dollar — over-limit means fees, a possible penalty rate, and a
 * utilization figure the score treats as maxed.
 */
export type Milestone = "under_limit" | "under_target" | "done";

export interface CardUtilization {
  debtId: string;
  name: string;
  balance: number;
  limit: number;
  /** Percent of the limit in use. Over 100 means the card is over its limit. */
  percent: number;
  /** Paid down to hit the target. 0 when already at or below it. */
  toTarget: number;
  /** Paid down just to get back under the limit. 0 unless over it. */
  toUnderLimit: number;
  overLimit: boolean;
  atTarget: boolean;
  milestone: Milestone;
  /** What the next milestone costs — the number that orders the plan. */
  milestoneCost: number;
}

export interface UtilizationSummary {
  cards: CardUtilization[];
  totalBalance: number;
  totalLimit: number;
  /** Every revolving balance over every limit. */
  aggregatePercent: number;
  /** Paid down, anywhere, to bring the aggregate to target. */
  aggregateToTarget: number;
  /** Paid down to bring every individual card to target. Always ≥ the above. */
  allCardsToTarget: number;
  target: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cards with a known limit, worst utilization first. */
export function utilizationSummary(
  debts: Debt[],
  segments: DebtSegment[] = [],
  target: number = DEFAULT_UTILIZATION_TARGET
): UtilizationSummary {
  const cards: CardUtilization[] = debts
    .filter((d) => d.type !== "bnpl" && d.credit_limit != null && d.credit_limit > 0)
    .map((d) => {
      const limit = d.credit_limit as number;
      const balance = cardBalance(d, segments);
      const allowed = (limit * target) / 100;
      const overLimit = balance > limit;
      const atTarget = balance <= allowed;
      const toTarget = round2(Math.max(balance - allowed, 0));
      // A dollar over the limit is the cheapest ground to recover, so it's the
      // milestone that orders an over-limit card rather than its full gap.
      const toUnderLimit = round2(Math.max(balance - limit, 0));
      const milestone: Milestone = overLimit
        ? "under_limit"
        : atTarget
          ? "done"
          : "under_target";
      return {
        debtId: d.id,
        name: d.name.trim(),
        balance,
        limit,
        percent: round2((balance / limit) * 100),
        toTarget,
        toUnderLimit,
        overLimit,
        atTarget,
        milestone,
        milestoneCost: overLimit ? toUnderLimit : atTarget ? 0 : toTarget,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const totalBalance = round2(sum(cards.map((c) => c.balance)));
  const totalLimit = round2(sum(cards.map((c) => c.limit)));

  return {
    cards,
    totalBalance,
    totalLimit,
    aggregatePercent: totalLimit > 0 ? round2((totalBalance / totalLimit) * 100) : 0,
    aggregateToTarget: round2(Math.max(totalBalance - (totalLimit * target) / 100, 0)),
    allCardsToTarget: round2(sum(cards.map((c) => c.toTarget))),
    target,
  };
}

/**
 * The order to attack cards in when the goal is a score rather than interest.
 *
 * An over-limit card comes first: exceeding the line is a harm of its own —
 * fees, a possible penalty rate, and a utilization figure above 100% — and
 * it's usually cheap to fix relative to the rest. After that it's the smallest
 * gap to the target first, because crossing the threshold on a whole card is
 * what moves per-card utilization, and the nearest card buys that for the
 * fewest dollars.
 *
 * Cards already at target drop out — there's nothing more for this goal to
 * buy on them, and the plan should go back to chasing interest.
 */
export function utilizationOrder(
  debts: Debt[],
  segments: DebtSegment[] = [],
  target: number = DEFAULT_UTILIZATION_TARGET
): CardUtilization[] {
  return utilizationSummary(debts, segments, target)
    .cards.filter((c) => !c.atTarget)
    .sort((a, b) => {
      // Clear every over-limit card first — it's usually a few dollars and it
      // stops an active harm — then buy whole cards under the target, nearest
      // first, because crossing the threshold is what the score reads.
      if (a.overLimit !== b.overLimit) return a.overLimit ? -1 : 1;
      return a.milestoneCost - b.milestoneCost;
    });
}

export interface UtilizationStep extends CardUtilization {
  /** Per paycheck to clear this card's gap in `paychecks` paydays. */
  perPaycheck: number;
  /** Paydays until this card crosses, paying the whole plan into it in turn. */
  paychecks: number;
  /** Utilization once this card and every card before it has crossed. */
  aggregateAfter: number;
}

/**
 * The order above turned into paycheck-sized pieces: given what a paycheck can
 * put toward debt, when each card crosses the target and where that leaves
 * overall utilization. A target with no payment attached to it isn't a plan.
 */
export function utilizationPlan(
  debts: Debt[],
  segments: DebtSegment[] = [],
  target: number = DEFAULT_UTILIZATION_TARGET,
  perPaycheckBudget = 0
): UtilizationStep[] {
  const summary = utilizationSummary(debts, segments, target);
  const order = utilizationOrder(debts, segments, target);

  const steps: UtilizationStep[] = [];
  let cumulative = 0;

  // Phase one: every card that's over its limit, back under it. Cheap, urgent,
  // and it comes before anything else the plan would rather do.
  for (const card of order.filter((c) => c.overLimit)) {
    cumulative += card.toUnderLimit;
    steps.push(step(card, "under_limit", card.toUnderLimit, cumulative));
  }

  // Phase two: whole cards under the target, nearest first. Re-sorted from
  // scratch — an over-limit card was only cheap to bring back under the line,
  // and its full gap to the target has to queue on its own merits.
  const remainingFor = (c: CardUtilization) =>
    round2(c.toTarget - (c.overLimit ? c.toUnderLimit : 0));
  for (const card of [...order].sort((a, b) => remainingFor(a) - remainingFor(b))) {
    const remaining = remainingFor(card);
    if (remaining <= 0) continue;
    cumulative += remaining;
    steps.push(step(card, "under_target", remaining, cumulative));
  }

  function step(
    card: CardUtilization,
    milestone: Milestone,
    cost: number,
    cumulativeCost: number
  ): UtilizationStep {
    const paychecks =
      perPaycheckBudget > 0 ? Math.ceil(cumulativeCost / perPaycheckBudget) : 0;
    return {
      ...card,
      milestone,
      milestoneCost: cost,
      paychecks,
      perPaycheck: paychecks > 0 ? round2(cumulativeCost / paychecks) : cost,
      aggregateAfter:
        summary.totalLimit > 0
          ? round2(((summary.totalBalance - cumulativeCost) / summary.totalLimit) * 100)
          : 0,
    };
  }

  return steps;
}
