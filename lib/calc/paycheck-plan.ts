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

export interface SavingsLine {
  name: string;
  amount: number; // per-paycheck contribution to this bucket/goal
}

export interface PaycheckPlanEntry {
  incomeSourceId: string;
  incomeSourceName: string;
  date: string; // yyyy-mm-dd payday
  net: number;
  assigned: AssignedObligation[];
  assignedTotal: number;
  savings: SavingsLine[]; // per-paycheck savings set-asides
  savingsTotal: number;
  budgetReserve: number; // this paycheck's share of undated monthly budget
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
 * and savings set-asides come in via `savings` — each a per-paycheck amount
 * taken from every paycheck and shown as its own line — so nothing is
 * double-counted.
 */
export function buildPaycheckPlan(
  sources: IncomeSource[],
  deductions: PaycheckDeduction[],
  obligations: Obligation[],
  allocations: ObligationAllocation[],
  monthlyBudget: number,
  savings: SavingsLine[],
  rangeStart: Date,
  rangeEnd: Date,
  limit = 6
): PaycheckPlanEntry[] {
  const monthlyIncome = monthlyNetIncome(sources, deductions);
  const obByKey = new Map(obligations.map((o) => [obKey(o.type, o.id, o.date), o]));

  const entries: PaycheckPlanEntry[] = [];
  for (const source of sources) {
    const deductionTotal = sum(
      deductions.filter((d) => d.income_source_id === source.id).map((d) => d.amount)
    );
    const net = source.gross_amount - deductionTotal;

    for (const date of getPaycheckOccurrences(source, rangeStart, rangeEnd)) {
      const iso = date.toISOString().slice(0, 10);

      const assigned: AssignedObligation[] = [];
      for (const a of allocations) {
        if (a.income_source_id !== source.id || a.paycheck_date !== iso) continue;
        const ref = allocationRef(a);
        if (!ref) continue;
        const ob = obByKey.get(obKey(ref.type, ref.id, a.bill_due_date));
        if (ob) assigned.push({ name: ob.name, amount: ob.amount, type: ob.type });
      }

      const assignedTotal = sum(assigned.map((a) => a.amount));
      const savingsLines = savings.filter((s) => s.amount > 0);
      const savingsTotal = sum(savingsLines.map((s) => s.amount));
      const budgetReserve =
        monthlyIncome > 0
          ? Math.round(monthlyBudget * (net / monthlyIncome) * 100) / 100
          : 0;
      const freeToSpend =
        Math.round((net - assignedTotal - savingsTotal - budgetReserve) * 100) / 100;

      entries.push({
        incomeSourceId: source.id,
        incomeSourceName: source.name,
        date: iso,
        net,
        assigned,
        assignedTotal,
        savings: savingsLines,
        savingsTotal,
        budgetReserve,
        freeToSpend,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries.slice(0, limit);
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
