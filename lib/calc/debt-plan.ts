import type {
  Bill,
  Debt,
  DebtPayment,
  Expense,
  IncomeSource,
  PaycheckDeduction,
  SavingsGoal,
} from "../supabase/types";
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
  payments: DebtPayment[]
): Evaluation {
  const income = monthlyNetIncome(sources, deductions);
  const billTotal = monthlyBills(bills);
  const expenseTotal = monthlyExpenses(expenses);
  const goalTotal = monthlySavingsContribution(sources, goals);
  const revolving = debts.filter((d) => d.type !== "bnpl" && d.balance > 0);
  const minimums = sum(revolving.map((d) => d.minimum_payment));
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

  const highApr = revolving.filter((d) => d.interest_rate >= 15);
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
// Payoff simulation. BNPL plans run on their fixed schedules; as each one
// (or any revolving debt) is finished, its payment rolls into the target
// debt chosen by the strategy. Total monthly outlay stays constant.
// ---------------------------------------------------------------------------

export type Strategy = "avalanche" | "snowball";

export interface PlanResult {
  feasible: boolean;
  months: number; // months until debt-free (capped)
  totalInterest: number;
  budget: number; // constant monthly outlay the plan assumes
  payoffs: { id: string; name: string; month: number; type: "bnpl" | "revolving" }[];
  capped: boolean;
}

export function simulatePayoff(
  debts: Debt[],
  extraPerMonth: number,
  strategy: Strategy,
  rollover = true
): PlanResult {
  const revolving = debts
    .filter((d) => d.type !== "bnpl" && d.balance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      rate: d.interest_rate / 100 / 12,
      min: d.minimum_payment,
      paidOffMonth: 0,
    }));
  const bnpl = debts
    .filter((d) => d.type === "bnpl" && (d.payments_remaining ?? 0) > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      remaining: d.payments_remaining ?? 0,
      installment: d.installment_amount ?? 0,
      perMonth: bnplPaymentsPerMonth(d),
      paidOffMonth: 0,
    }));

  const startMinimums = sum(revolving.map((d) => d.min));
  const startBnpl = sum(bnpl.map((b) => Math.min(b.perMonth, b.remaining) * b.installment));
  const budget = startMinimums + startBnpl + extraPerMonth;

  let month = 0;
  let totalInterest = 0;
  let feasible = true;
  const CAP = 600;

  const active = () => revolving.filter((d) => d.balance > 0.005);
  const pickTarget = () => {
    const candidates = active();
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) =>
      strategy === "avalanche"
        ? b.rate - a.rate || a.balance - b.balance
        : a.balance - b.balance || b.rate - a.rate
    )[0];
  };

  while (month < CAP && (active().length > 0 || bnpl.some((b) => b.remaining > 0))) {
    month += 1;

    // 1. BNPL installments due this month (fixed, non-negotiable).
    let bnplDue = 0;
    for (const b of bnpl) {
      if (b.remaining === 0) continue;
      const count = Math.min(b.perMonth, b.remaining);
      bnplDue += count * b.installment;
      b.remaining -= count;
      if (b.remaining === 0) b.paidOffMonth = month;
    }

    // 2. Interest accrues, minimums get paid.
    let paidThisMonth = bnplDue;
    for (const d of active()) {
      const interest = d.balance * d.rate;
      totalInterest += interest;
      d.balance += interest;
      const payment = Math.min(d.min, d.balance);
      d.balance -= payment;
      paidThisMonth += payment;
      if (d.balance <= 0.005) {
        d.balance = 0;
        d.paidOffMonth = month;
      }
    }

    if (paidThisMonth > budget + 0.01) feasible = false;

    // 3. Whatever's left of the fixed budget attacks the target debt(s).
    if (rollover) {
      let pool = Math.max(budget - paidThisMonth, 0);
      let target = pickTarget();
      while (target && pool > 0.005) {
        const payment = Math.min(pool, target.balance);
        target.balance -= payment;
        pool -= payment;
        if (target.balance <= 0.005) {
          target.balance = 0;
          target.paidOffMonth = month;
          target = pickTarget();
        }
      }
    }
  }

  const payoffs = [
    ...bnpl.map((b) => ({
      id: b.id,
      name: b.name,
      month: b.paidOffMonth || month,
      type: "bnpl" as const,
    })),
    ...revolving.map((d) => ({
      id: d.id,
      name: d.name,
      month: d.paidOffMonth || month,
      type: "revolving" as const,
    })),
  ].sort((a, b) => a.month - b.month);

  return {
    feasible,
    months: month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    budget: Math.round(budget * 100) / 100,
    payoffs,
    capped: month >= CAP,
  };
}
