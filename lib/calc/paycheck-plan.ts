import { addDays } from "date-fns";
import { getPaycheckOccurrences } from "./schedule";
import { monthlyNetIncome } from "./debt-plan";
import { sum } from "./money";
import type { Obligation } from "./obligations";
import type {
  IncomeSource,
  ObligationAllocation,
  ObligationType,
  PaycheckDeduction,
} from "../supabase/types";

export interface AssignedObligation {
  name: string;
  amount: number;
  type: ObligationType;
}

export interface SavingsGoalInput {
  name: string;
  perPaycheck: number; // planned per-paycheck contribution
  currentAmount: number; // saved so far
  targetAmount: number | null; // null = general pool, contributes indefinitely
}

export interface SavingsLine {
  name: string;
  amount: number; // this paycheck's contribution to the bucket/goal
  completesGoal: boolean; // this contribution reaches the target (last one)
}

/**
 * An extra debt payment the user has assigned to a specific paycheck. Nothing
 * is subtracted from a paycheck unless it's assigned — a recommendation applied
 * to every paycheck was never how the money actually moved.
 */
export interface AssignedSnowballPayment {
  id: string;
  incomeSourceId: string;
  paycheckDate: string;
  targetName: string;
  amount: number;
}

export interface SnowballPart {
  id: string;
  targetName: string;
  amount: number;
}

export interface PaycheckPlanEntry {
  incomeSourceId: string;
  incomeSourceName: string;
  date: string; // yyyy-mm-dd payday
  isCurrent: boolean; // the pay period you're in right now (payday on or before today)
  net: number;
  assigned: AssignedObligation[];
  assignedTotal: number;
  savings: SavingsLine[]; // per-paycheck savings set-asides
  savingsTotal: number;
  budgetReserve: number; // this paycheck's share of undated monthly budget
  /** Extra debt payments assigned to this paycheck. Empty unless assigned. */
  snowball: SnowballPart[];
  snowballTotal: number;
  freeToSpend: number;
}

function obKey(type: ObligationType, id: string, date: string): string {
  return `${type}:${id}:${date}`;
}

function allocationRef(a: ObligationAllocation): { type: ObligationType; id: string } | null {
  if (a.bill_id) return { type: "bill", id: a.bill_id };
  if (a.debt_id) return { type: "debt", id: a.debt_id };
  if (a.expense_id) return { type: "expense", id: a.expense_id };
  return null;
}

/**
 * Builds a per-paycheck "safe to spend" plan: for each upcoming paycheck, the
 * net pay minus obligations assigned to it minus that paycheck's proportional
 * share of the undated monthly budget (everyday spending + planned goal
 * contributions). What's left is genuinely free to spend.
 *
 * `monthlyBudget` = undated everyday expense budget only. Dated obligations
 * (bills, debt payments, subscriptions) flow through `obligations`/`allocations`,
 * and savings set-asides come in via `savings` — simulated forward so each goal
 * fills to its target and then stops, freeing its contribution back into
 * free-to-spend — so nothing is double-counted.
 *
 * Extra debt payments come in via `snowballPayments` and are subtracted only
 * from the paycheck they're assigned to. Recommending where the next one should
 * go is a separate concern — see `suggestSnowballPayments`.
 *
 * All date filtering compares calendar-day strings (never instants), so a
 * payday that lands *today* is never dropped for being "earlier than now."
 * With `includeCurrent`, each source's most recent payday on or before today is
 * kept and flagged `isCurrent` — the pay period you're actually living in —
 * instead of jumping straight to the next one.
 */
export function buildPaycheckPlan(
  sources: IncomeSource[],
  deductions: PaycheckDeduction[],
  obligations: Obligation[],
  allocations: ObligationAllocation[],
  monthlyBudget: number,
  savings: SavingsGoalInput[],
  rangeStart: Date,
  rangeEnd: Date,
  limit = 6,
  snowballPayments: AssignedSnowballPayment[] = [],
  includeCurrent = false
): PaycheckPlanEntry[] {
  const monthlyIncome = monthlyNetIncome(sources, deductions);
  const obByKey = new Map(obligations.map((o) => [obKey(o.type, o.id, o.date), o]));

  // Today as a calendar-day string in the viewer's own timezone, so "is this
  // payday today or later?" is a clean string comparison with no UTC drift.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  // Look back far enough to catch the current pay period's payday (a monthly
  // schedule can be ~31 days back); precise filtering happens per source below.
  // Even without includeCurrent, look back a couple days so a payday that lands
  // *today* — stored at UTC midnight, which is "before now" — isn't dropped by
  // the occurrence generator's instant comparison before we can keep it.
  const genStart = addDays(rangeStart, includeCurrent ? -35 : -2);

  // Pass 1: build every entry with its free-to-spend before the snowball.
  const entries: (PaycheckPlanEntry & { freeBeforeSnowball: number })[] = [];
  for (const source of sources) {
    const deductionTotal = sum(
      deductions.filter((d) => d.income_source_id === source.id).map((d) => d.amount)
    );
    const net = source.gross_amount - deductionTotal;

    const isos = getPaycheckOccurrences(source, genStart, rangeEnd)
      .map((d) => d.toISOString().slice(0, 10))
      .sort();
    // The current period's payday: the latest one on or before today. Keep it
    // and everything after; drop older paydays. Without includeCurrent, keep
    // only today and future.
    const pastOrToday = isos.filter((iso) => iso <= todayIso);
    const currentIso =
      includeCurrent && pastOrToday.length > 0 ? pastOrToday[pastOrToday.length - 1] : todayIso;

    for (const iso of isos) {
      if (iso < currentIso) continue;

      const assigned: AssignedObligation[] = [];
      for (const a of allocations) {
        if (a.income_source_id !== source.id || a.paycheck_date !== iso) continue;
        const ref = allocationRef(a);
        if (!ref) continue;
        const ob = obByKey.get(obKey(ref.type, ref.id, a.bill_due_date));
        if (ob) assigned.push({ name: ob.name, amount: ob.amount, type: ob.type });
      }

      const assignedTotal = sum(assigned.map((a) => a.amount));
      const budgetReserve =
        monthlyIncome > 0
          ? Math.round(monthlyBudget * (net / monthlyIncome) * 100) / 100
          : 0;

      entries.push({
        incomeSourceId: source.id,
        incomeSourceName: source.name,
        date: iso,
        isCurrent: includeCurrent && iso === currentIso && currentIso <= todayIso,
        net,
        assigned,
        assignedTotal,
        savings: [], // filled by the savings pass
        savingsTotal: 0,
        budgetReserve,
        snowball: [],
        snowballTotal: 0,
        freeToSpend: 0, // set by the savings pass, then the snowball pass
        freeBeforeSnowball: 0,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Savings pass: walk paychecks in order, contributing to each goal until it
  // reaches its target, then stopping — so a funded goal frees its per-paycheck
  // contribution straight back into free-to-spend. Pools (no target) keep
  // contributing. The last contribution is trimmed to land exactly on target.
  const pots = savings
    .filter((s) => s.perPaycheck > 0)
    .map((s) => ({
      name: s.name,
      perPaycheck: s.perPaycheck,
      left: s.targetAmount == null ? Infinity : Math.max(s.targetAmount - s.currentAmount, 0),
    }));
  for (const entry of entries) {
    const lines: SavingsLine[] = [];
    for (const pot of pots) {
      if (pot.left <= 0.005) continue;
      const amount = Math.round(Math.min(pot.perPaycheck, pot.left) * 100) / 100;
      if (amount <= 0) continue;
      if (pot.left !== Infinity) pot.left = Math.round((pot.left - amount) * 100) / 100;
      lines.push({ name: pot.name, amount, completesGoal: pot.left <= 0.005 });
    }
    entry.savings = lines;
    entry.savingsTotal = Math.round(sum(lines.map((l) => l.amount)) * 100) / 100;
    entry.freeBeforeSnowball =
      Math.round((entry.net - entry.assignedTotal - entry.savingsTotal - entry.budgetReserve) * 100) /
      100;
    entry.freeToSpend = entry.freeBeforeSnowball;
  }

  // Snowball pass: subtract only the extra payments actually assigned to each
  // paycheck. Nothing is projected onto paychecks the user didn't choose.
  if (snowballPayments.length > 0) {
    for (const entry of entries) {
      const parts: SnowballPart[] = snowballPayments
        .filter(
          (p) =>
            p.incomeSourceId === entry.incomeSourceId && p.paycheckDate === entry.date
        )
        .map((p) => ({ id: p.id, targetName: p.targetName, amount: p.amount }));
      if (parts.length === 0) continue;

      entry.snowball = parts;
      entry.snowballTotal = Math.round(sum(parts.map((p) => p.amount)) * 100) / 100;
      entry.freeToSpend =
        Math.round((entry.freeBeforeSnowball - entry.snowballTotal) * 100) / 100;
    }
  }

  return entries.slice(0, limit).map(({ freeBeforeSnowball: _omit, ...entry }) => entry);
}

/**
 * Rough "days of debt freedom" a discretionary purchase costs: money spent is
 * money that couldn't go toward debt, so a purchase delays the payoff by
 * roughly amount / (daily debt paydown). Returns null when there's no debt
 * paydown to trade against.
 */
export function daysOfDebtFreedom(amount: number, monthlyDebtOutlay: number): number | null {
  if (monthlyDebtOutlay <= 0 || amount <= 0) return null;
  return Math.round(amount / (monthlyDebtOutlay / 30));
}
