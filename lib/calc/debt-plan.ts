import type {
  Bill,
  Debt,
  DebtPayment,
  DebtSegment,
  Expense,
  IncomeSource,
  PaycheckDeduction,
  SavingsGoal,
} from "../supabase/types";
import {
  aprOn,
  applyToParts,
  cardBalance,
  debtParts,
  marginalApr,
  type DebtPart,
} from "../debts/segments";
import { minimumFromParts, minimumPayment } from "../debts/minimum";
import { DEFAULT_UTILIZATION_TARGET } from "../debts/utilization";
import { bnplPayoff } from "./bnpl";
import { sum } from "./money";
import { monthlyExpenses } from "./obligations";

// ---------------------------------------------------------------------------
// Normalization: everything to steady-state dollars per month.
// ---------------------------------------------------------------------------

export function monthlyNetIncome(
  sources: IncomeSource[],
  deductions: PaycheckDeduction[]
): number {
  return sum(
    sources.map((source) => {
      const net =
        source.gross_amount -
        sum(
          deductions
            .filter((d) => d.income_source_id === source.id)
            .map((d) => d.amount)
        );
      switch (source.frequency) {
        case "weekly":
          return (net * 52) / 12;
        case "biweekly":
          return (net * 26) / 12;
        case "semimonthly":
          return net * 2;
        case "monthly":
          return net;
      }
    })
  );
}

/** Expected number of paychecks in a month across all active income sources. */
export function paychecksPerMonth(sources: IncomeSource[]): number {
  return sum(
    sources.map((source) => {
      switch (source.frequency) {
        case "weekly":
          return 52 / 12;
        case "biweekly":
          return 26 / 12;
        case "semimonthly":
          return 2;
        case "monthly":
          return 1;
      }
    })
  );
}

/**
 * Monthly savings set-aside. Contributions are entered per paycheck (what each
 * paycheck moves to savings), so the monthly figure scales by how many
 * paychecks land in a month.
 */
export function monthlySavingsContribution(
  sources: IncomeSource[],
  goals: SavingsGoal[]
): number {
  return sum(goals.map((g) => g.per_paycheck_contribution ?? 0)) * paychecksPerMonth(sources);
}

export function monthlyBills(bills: Bill[]): number {
  return sum(
    bills.map((bill) => {
      switch (bill.frequency) {
        case "weekly":
          return (bill.amount * 52) / 12;
        case "biweekly":
          return (bill.amount * 26) / 12;
        case "monthly":
          return bill.amount;
        case "yearly":
          return bill.amount / 12;
        case "one_time":
          return 0; // not a recurring obligation
      }
    })
  );
}

/** Installments per month for a BNPL cadence (approximation used by the simulator). */
function bnplPaymentsPerMonth(debt: Debt): number {
  switch (debt.installment_frequency) {
    case "weekly":
      return 4;
    case "biweekly":
      return 2;
    default:
      return 1;
  }
}

/**
 * A BNPL plan's remaining scheduled total (the "ride it out" cost). This is the
 * stored balance, which can be the real lender figure — often less than
 * installment × payments because the final payment is a small stub, not a full
 * installment (e.g. 10 × $17.58 + $2.80 = $178.60, not 11 × $17.58).
 */
export function bnplScheduledTotal(debt: Debt): number {
  return debt.balance;
}

/**
 * What you'd owe to clear a debt today. For BNPL, in order of preference: the
 * lender's own payoff figure, then the payoff computed from the plan's APR
 * (present value of the remaining installments), then — with no rate to go on —
 * the scheduled total. For a card, the sum of its balance segments, which is
 * the stored balance when it has none.
 */
export function debtPayoff(debt: Debt, segments: DebtSegment[] = []): number {
  if (debt.type !== "bnpl") return cardBalance(debt, segments);
  if (debt.settlement_amount != null) return debt.settlement_amount;
  if (debt.interest_rate > 0) {
    return bnplPayoff(
      debt.installment_amount ?? 0,
      debt.payments_remaining ?? 0,
      debt.interest_rate
    );
  }
  return bnplScheduledTotal(debt);
}

/** Current monthly BNPL obligation across all active plans. */
export function monthlyBnplObligation(debts: Debt[]): number {
  return sum(
    debts
      .filter((d) => d.type === "bnpl" && (d.payments_remaining ?? 0) > 0)
      .map(
        (d) =>
          Math.min(bnplPaymentsPerMonth(d), d.payments_remaining ?? 0) *
          (d.installment_amount ?? 0)
      )
  );
}

// ---------------------------------------------------------------------------
// Spending-behavior evaluation (from what the app tracks — income, bills,
// goals, committed debt payments, and the payment history actually logged).
// ---------------------------------------------------------------------------

export type Finding = { kind: "good" | "warn" | "info"; text: string };

export interface Evaluation {
  income: number;
  bills: number;
  expenses: number; // monthly budgeted spending
  goals: number;
  minimums: number; // revolving minimum payments
  bnpl: number; // current monthly BNPL obligation
  surplus: number;
  findings: Finding[];
}

export function evaluate(
  sources: IncomeSource[],
  deductions: PaycheckDeduction[],
  bills: Bill[],
  expenses: Expense[],
  goals: SavingsGoal[],
  debts: Debt[],
  payments: DebtPayment[],
  segments: DebtSegment[] = []
): Evaluation {
  const income = monthlyNetIncome(sources, deductions);
  const billTotal = monthlyBills(bills);
  const expenseTotal = monthlyExpenses(expenses);
  const goalTotal = monthlySavingsContribution(sources, goals);
  const revolving = debts.filter((d) => d.type !== "bnpl" && cardBalance(d, segments) > 0);
  const minimums = sum(revolving.map((d) => minimumPayment(d, segments)));
  const bnpl = monthlyBnplObligation(debts);
  const committed = minimums + bnpl;
  const surplus = income - billTotal - expenseTotal - goalTotal - committed;

  const findings: Finding[] = [];

  if (income === 0) {
    findings.push({
      kind: "info",
      text: "No income sources yet — add paychecks so the plan can compute what's available.",
    });
  }
  if (surplus < 0) {
    findings.push({
      kind: "warn",
      text: `Committed spending exceeds income by ${fmt(-surplus)}/mo. Before a payoff plan can work, something has to give — review bills and goal contributions.`,
    });
  } else if (income > 0 && surplus < income * 0.1) {
    findings.push({
      kind: "warn",
      text: `Only ${fmt(surplus)}/mo (${Math.round((surplus / income) * 100)}% of income) is uncommitted — the margin is thin, so the plan will be slow unless spending comes down.`,
    });
  } else if (income > 0) {
    findings.push({
      kind: "good",
      text: `${fmt(surplus)}/mo (${Math.round((surplus / income) * 100)}% of income) is available to attack debt.`,
    });
  }

  // A card holding a 0% transfer next to 24% purchases is a high-APR card at
  // the margin, so it's the costliest bucket that decides.
  const highApr = revolving.filter((d) => marginalApr(d, segments) >= 15);
  if (goalTotal > 0 && highApr.length > 0) {
    findings.push({
      kind: "info",
      text: `You're contributing ${fmt(goalTotal)}/mo to savings goals while carrying ${
        highApr.length
      } debt${highApr.length === 1 ? "" : "s"} above 15% APR. Redirecting those contributions until the high-interest debt is gone would save real money.`,
    });
  }

  const activeBnpl = debts.filter(
    (d) => d.type === "bnpl" && (d.payments_remaining ?? 0) > 0
  );
  if (activeBnpl.length >= 3) {
    findings.push({
      kind: "warn",
      text: `${activeBnpl.length} BNPL plans are running at once (${fmt(bnpl)}/mo). Stacked installments are the most common way BNPL sneaks up on a budget — consider a pause on new plans until these clear.`,
    });
  } else if (activeBnpl.length > 0) {
    findings.push({
      kind: "info",
      text: `BNPL installments are ${fmt(bnpl)}/mo right now; each plan that finishes frees its payment for the next debt.`,
    });
  }

  // Payment behavior: what's actually been logged over the last 90 days
  // versus what's committed.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const recent = payments.filter((p) => new Date(p.paid_on) >= cutoff);
  if (recent.length > 0 && committed > 0) {
    const avgMonthly = sum(recent.map((p) => p.amount)) / 3;
    if (avgMonthly > committed * 1.1) {
      findings.push({
        kind: "good",
        text: `Over the last 90 days you've averaged ${fmt(avgMonthly)}/mo toward debt — about ${fmt(avgMonthly - committed)}/mo beyond the committed payments. Keep that up and the plan below is conservative.`,
      });
    } else if (avgMonthly < committed * 0.9) {
      findings.push({
        kind: "warn",
        text: `Logged payments over the last 90 days average ${fmt(avgMonthly)}/mo, below the ${fmt(committed)}/mo the plan assumes. The projections only hold if minimums and installments actually get paid.`,
      });
    }
  }

  return {
    income,
    bills: billTotal,
    expenses: expenseTotal,
    goals: goalTotal,
    minimums,
    bnpl,
    surplus,
    findings,
  };
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Safe snowball recommendation: how much extra per month can comfortably go
// toward debt. Start from the real surplus (income − bills − expenses −
// savings − committed debt payments) and hold back a cushion so one surprise
// doesn't sink the plan.
// ---------------------------------------------------------------------------

export interface SnowballRecommendation {
  surplus: number; // monthly surplus the budget shows
  buffer: number; // cushion held back for surprises
  recommended: number; // safe monthly snowball (never negative)
}

export function recommendSnowball(evaluation: Evaluation): SnowballRecommendation {
  const buffer = Math.max(Math.round(evaluation.income * 0.1), 100);
  const recommended = Math.max(Math.floor((evaluation.surplus - buffer) / 10) * 10, 0);
  return { surplus: evaluation.surplus, buffer, recommended };
}

// ---------------------------------------------------------------------------
// Payoff simulation. Every debt is a payoff target — including BNPL plans,
// which can be paid off early (their balance is the remaining installments;
// at 0% there's no interest to save, but finishing one frees its payment).
// Snowball targets the smallest balance, so a small BNPL plan ranks ahead of
// a bigger card; avalanche targets the highest rate, so 0% BNPL naturally
// waits. As each debt clears, its payment rolls into the snowball — total
// monthly outlay stays constant while the amount attacking the target grows.
// ---------------------------------------------------------------------------

export type Strategy = "avalanche" | "snowball" | "utilization";

/**
 * Debts in the order the strategy attacks them — [0] is the current target,
 * the next extra dollar's destination. BNPL plans count (balance = remaining
 * installments), matching the simulator's targeting. Snowball orders by
 * smallest balance first; avalanche by highest rate first.
 */
export function orderedSnowballTargets(
  debts: Debt[],
  strategy: Strategy,
  segments: DebtSegment[] = [],
  utilizationTarget: number = DEFAULT_UTILIZATION_TARGET
): { id: string; name: string; balance: number }[] {
  if (strategy === "utilization") {
    // Every debt's next milestone, cheapest first — the same ordering the
    // simulator walks. A card above the target is priced at the gap down to
    // it; a card already at target, and anything without a credit line, is
    // priced at a full payoff, so a crossed card's remnant stays in the queue
    // instead of dropping out of the plan. Over-limit cards come first.
    const limitOf = (d: Debt) =>
      d.type !== "bnpl" && d.credit_limit != null && d.credit_limit > 0
        ? d.credit_limit
        : null;
    return debts
      .map((d) => {
        const balance = debtPayoff(d, segments);
        const limit = limitOf(d);
        const over = limit == null ? 0 : Math.max(balance - limit, 0);
        const gap =
          limit == null ? 0 : Math.max(balance - (limit * utilizationTarget) / 100, 0);
        return {
          id: d.id,
          name: d.name,
          balance,
          cost: over > 0.005 ? over : gap > 0.005 ? gap : balance,
          over: over > 0.005,
          rate: d.type === "bnpl" ? d.interest_rate : marginalApr(d, segments),
        };
      })
      .filter((c) => c.balance > 0)
      .sort((a, b) =>
        a.over !== b.over ? (a.over ? -1 : 1) : a.cost - b.cost || b.rate - a.rate
      )
      .map(({ id, name, balance }) => ({ id, name, balance }));
  }

  return debts
    .map((d) => ({
      id: d.id,
      name: d.name,
      // BNPL carries a real rate too — often above a credit card's — so it
      // takes part in avalanche ordering on the same footing.
      balance: debtPayoff(d, segments),
      // A card's segments each have their own rate, and an extra dollar goes to
      // the most expensive one — so that, not the card's average, is what
      // avalanche is choosing between.
      rate: d.type === "bnpl" ? d.interest_rate : marginalApr(d, segments),
    }))
    .filter((c) => c.balance > 0)
    .sort((a, b) =>
      strategy === "avalanche"
        ? b.rate - a.rate || a.balance - b.balance
        : a.balance - b.balance || b.rate - a.rate
    )
    .map(({ id, name, balance }) => ({ id, name, balance }));
}

export interface PlanPayoff {
  id: string;
  name: string;
  month: number;
  type: "bnpl" | "revolving";
  freed: number; // monthly payment this payoff frees
  snowballAfter: number; // extra + all freed payments once this debt clears
}

export interface PlanResult {
  feasible: boolean;
  months: number; // months until debt-free (capped)
  totalInterest: number;
  budget: number; // constant monthly outlay the plan assumes
  payoffs: PlanPayoff[];
  capped: boolean;
}

/**
 * An extra payment already assigned to a specific paycheck, expressed as the
 * simulation month it lands in. Without these the projection assumes the
 * monthly budget flows to whatever the strategy would pick, which contradicts
 * the payments the user actually committed to on Safe to Spend.
 */
export interface ScheduledExtra {
  debtId: string;
  amount: number;
  /** 1-based month of the simulation. */
  month: number;
}

interface SimItem {
  id: string;
  name: string;
  type: "bnpl" | "revolving";
  /** Balance buckets, each at its own rate. Cards without segments have one. */
  parts: DebtPart[];
  /**
   * How the monthly minimum is arrived at. A calculated minimum has to be
   * recomputed each month: it shrinks as the balance does, and it jumps when a
   * promo rate lapses and the whole balance starts accruing.
   */
  rule: Pick<
    Debt,
    "minimum_rule" | "minimum_percent" | "minimum_floor" | "minimum_payment"
  >;
  /** The card's credit line, when it has one. Only utilization targeting uses it. */
  limit: number | null;
  paidOffMonth: number;
}

/** What this debt asks for in the month containing `on`, at its current balance. */
function minOf(d: SimItem, on: Date): number {
  return d.type === "bnpl"
    ? d.rule.minimum_payment
    : minimumFromParts(d.rule, d.parts, on);
}

const balanceOf = (d: SimItem) => sum(d.parts.map((p) => p.balance));

export function simulatePayoff(
  debts: Debt[],
  extraPerMonth: number,
  strategy: Strategy,
  rollover = true,
  scheduled: ScheduledExtra[] = [],
  segments: DebtSegment[] = [],
  today = new Date(),
  utilizationTarget: number = DEFAULT_UTILIZATION_TARGET
): PlanResult {
  const items: SimItem[] = [
    ...debts
      .filter((d) => d.type !== "bnpl" && cardBalance(d, segments) > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        type: "revolving" as const,
        parts: debtParts(d, segments).map((p) => ({ ...p })),
        rule: {
          minimum_rule: d.minimum_rule,
          minimum_percent: d.minimum_percent,
          minimum_floor: d.minimum_floor,
          minimum_payment: d.minimum_payment,
        },
        limit: d.credit_limit,
        paidOffMonth: 0,
      })),
    ...debts
      .filter((d) => d.type === "bnpl" && (d.payments_remaining ?? 0) > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        type: "bnpl" as const,
        // An installment loan is just an amortizing debt: the balance owed today
        // is the payoff, interest accrues on it at the plan's rate, and the
        // installment pays it down. Ride the schedule and it clears in exactly
        // the payments remaining; settle early and the unaccrued interest is
        // never charged — both fall out of the same arithmetic.
        parts: [
          {
            id: d.id,
            kind: "purchase" as const,
            balance: debtPayoff(d),
            apr: d.interest_rate,
            promoEndsOn: null,
            postPromoApr: null,
          },
        ],
        rule: {
          minimum_rule: "manual" as const,
          minimum_percent: null,
          minimum_floor: null,
          minimum_payment: bnplPaymentsPerMonth(d) * (d.installment_amount ?? 0),
        },
        limit: null,
        paidOffMonth: 0,
      })),
  ];

  const startMin = new Map(items.map((d) => [d.id, Math.min(minOf(d, today), balanceOf(d))]));
  const startMinimums = sum([...startMin.values()]);
  const budget = startMinimums + extraPerMonth;

  let month = 0;
  let totalInterest = 0;
  let feasible = true;
  const CAP = 600;

  const active = () => items.filter((d) => balanceOf(d) > 0.005);
  // The rate that matters for ordering is the one the next extra dollar avoids,
  // which is the costliest bucket still carrying a balance — not the card's
  // blended average.
  const topRate = (d: SimItem, on: Date) =>
    Math.max(0, ...d.parts.filter((p) => p.balance > 0).map((p) => aprOn(p, on)));
  // How far above the utilization target a card still is, in dollars.
  const gapToTarget = (d: SimItem) =>
    d.limit == null
      ? 0
      : Math.max(balanceOf(d) - (d.limit * utilizationTarget) / 100, 0);
  const overBy = (d: SimItem) =>
    d.limit == null ? 0 : Math.max(balanceOf(d) - d.limit, 0);
  /**
   * The next milestone worth buying on this card. Getting back under the limit
   * is separate from — and far cheaper than — getting to the target, so it's
   * bought first and priced on its own.
   */
  const nextMilestone = (d: SimItem) => (overBy(d) > 0.005 ? overBy(d) : gapToTarget(d));

  const pickTarget = (on: Date) => {
    const candidates = active();
    if (candidates.length === 0) return null;

    if (strategy === "utilization") {
      // Every debt's next milestone, cheapest first. For a card still above
      // the target that's the dollar gap down to it; for everything else — a
      // card already at target, or anything without a credit line (BNPL,
      // personal and auto loans) — it's a full payoff, the only milestone
      // those have left to buy.
      //
      // Crossing the target does not retire a card. Its remnant comes back
      // priced at its balance, which is usually the cheapest thing in the
      // queue, so it gets finished off rather than abandoned to its minimum
      // for years while the snowball pours into a far larger, far cheaper
      // debt. Over-limit cards still jump the queue regardless of cost —
      // that's active harm (fees, a possible penalty rate) and cheap to undo.
      const milestoneCost = (d: SimItem): number => {
        if (overBy(d) > 0.005) return overBy(d);
        const gap = gapToTarget(d);
        return gap > 0.005 ? gap : balanceOf(d);
      };
      return candidates
        .map((d) => ({ d, cost: milestoneCost(d) }))
        .sort((a, b) => {
          const aOver = overBy(a.d) > 0.005;
          const bOver = overBy(b.d) > 0.005;
          if (aOver !== bOver) return aOver ? -1 : 1;
          // Same price, so let the costlier rate settle it.
          return a.cost - b.cost || topRate(b.d, on) - topRate(a.d, on);
        })[0].d;
    }

    return candidates.sort((a, b) =>
      strategy === "avalanche"
        ? topRate(b, on) - topRate(a, on) || balanceOf(a) - balanceOf(b)
        : balanceOf(a) - balanceOf(b) || topRate(b, on) - topRate(a, on)
    )[0];
  };
  const settle = (d: SimItem, m: number) => {
    if (balanceOf(d) <= 0.005) {
      for (const p of d.parts) p.balance = 0;
      if (d.paidOffMonth === 0) d.paidOffMonth = m;
    }
  };

  while (month < CAP && active().length > 0) {
    month += 1;
    // The calendar date this simulated month lands on, so a promo rate expires
    // partway through the projection exactly when it expires in real life.
    const on = new Date(today.getFullYear(), today.getMonth() + month - 1, 1);

    // 1. Interest accrues per bucket at its own rate, then the minimum is paid.
    // Issuers allocate the minimum to the cheapest balance first, which is
    // precisely why a 0% transfer can sit untouched while purchases compound.
    let paidThisMonth = 0;
    for (const d of active()) {
      for (const part of d.parts) {
        const rate = aprOn(part, on) / 100 / 12;
        if (rate > 0 && part.balance > 0) {
          const interest = part.balance * rate;
          totalInterest += interest;
          part.balance += interest;
        }
      }
      const payment = Math.min(minOf(d, on), balanceOf(d));
      applyToParts(d.parts, payment, "cheapest_first", on);
      paidThisMonth += payment;
      settle(d, month);
    }

    // 2. Extra payments already assigned to this month go to the debt they
    // were assigned to, not to whatever the strategy would have picked. An
    // assignment is that month's extra rather than an addition to it.
    const dueNow = scheduled.filter((s) => s.month === month);
    let extraThisMonth = extraPerMonth;
    if (dueNow.length > 0) {
      extraThisMonth = sum(dueNow.map((s) => s.amount));
      for (const s of dueNow) {
        const target = items.find((d) => d.id === s.debtId);
        if (!target || balanceOf(target) <= 0.005) continue;
        const payment = Math.min(s.amount, balanceOf(target));
        applyToParts(target.parts, payment, "costliest_first", on);
        paidThisMonth += payment;
        settle(target, month);
      }
    }

    // Freed-up minimums still roll forward on top of this month's extra.
    const monthlyBudget = startMinimums + extraThisMonth;
    if (paidThisMonth > monthlyBudget + 0.01) feasible = false;

    // 3. Whatever's left of the budget — the snowball — attacks the target
    // debt(s) chosen by the strategy. Above-minimum money must go to the
    // highest rate on the card it lands on (Reg Z §1026.53).
    if (rollover) {
      let pool = Math.max(monthlyBudget - paidThisMonth, 0);
      let target = pickTarget(on);
      let guard = 0;
      while (target && pool > 0.005 && guard++ < items.length * 2 + 2) {
        // Utilization targeting stops at the threshold rather than paying the
        // card off — crossing 30% is the whole win, and the next dollar buys
        // more on the next card still above it.
        const ceiling =
          strategy === "utilization" && nextMilestone(target) > 0.005
            ? nextMilestone(target)
            : balanceOf(target);
        const payment = Math.min(pool, ceiling);
        applyToParts(target.parts, payment, "costliest_first", on);
        pool -= payment;
        settle(target, month);
        const next = pickTarget(on);
        if (next === target && payment <= 0.005) break;
        target = next;
      }
    }
  }

  let snowball = extraPerMonth;
  const payoffs = items
    .slice()
    .sort((a, b) => (a.paidOffMonth || month) - (b.paidOffMonth || month))
    .map((d) => {
      // What clearing this debt frees is the payment it was taking when the
      // plan started, not its final (smaller) one.
      const freed = startMin.get(d.id) ?? 0;
      snowball += freed;
      return {
        id: d.id,
        name: d.name,
        month: d.paidOffMonth || month,
        type: d.type,
        freed: Math.round(freed * 100) / 100,
        snowballAfter: Math.round(snowball * 100) / 100,
      };
    });

  return {
    feasible,
    months: month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    budget: Math.round(budget * 100) / 100,
    payoffs,
    capped: month >= CAP,
  };
}
