import { addDays, addMonths, getDaysInMonth, isWithinInterval, setDate, startOfMonth } from "date-fns";
import type { Bill, Debt, DebtSegment, Expense, ObligationType } from "../supabase/types";
import { minimumPayment } from "../debts/minimum";
import { getBillOccurrences } from "./bills";

/**
 * A single dated thing a paycheck can be asked to cover — unified across bills,
 * debt payments, and dated (subscription) expenses so the planning UI, the
 * calendar, and the dashboard can treat them the same way.
 */
export interface Obligation {
  type: ObligationType;
  id: string; // the source row's id
  name: string;
  amount: number;
  date: string; // yyyy-mm-dd occurrence / due date
  category: string;
  userId: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthlyDueOccurrences(dueDay: number, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = [];
  let month = startOfMonth(rangeStart);
  while (month <= rangeEnd) {
    const day = Math.min(dueDay, getDaysInMonth(month));
    const date = setDate(month, day);
    if (isWithinInterval(date, { start: rangeStart, end: rangeEnd })) dates.push(date);
    month = addMonths(month, 1);
  }
  return dates;
}

/** Payment occurrences for a debt: monthly minimum for revolving, the fixed schedule for BNPL. */
export function getDebtOccurrences(
  debt: Debt,
  rangeStart: Date,
  rangeEnd: Date,
  segments: DebtSegment[] = []
): Date[] {
  if (debt.type === "bnpl") {
    if (!debt.next_payment_date || (debt.payments_remaining ?? 0) <= 0) return [];
    const step =
      debt.installment_frequency === "weekly"
        ? 7
        : debt.installment_frequency === "biweekly"
          ? 14
          : 0;
    const dates: Date[] = [];
    let cursor = new Date(debt.next_payment_date);
    for (let i = 0; i < (debt.payments_remaining ?? 0); i++) {
      if (cursor > rangeEnd) break;
      if (cursor >= rangeStart) dates.push(cursor);
      cursor = step ? addDays(cursor, step) : addMonths(cursor, 1);
    }
    return dates;
  }

  // Revolving debt: a monthly minimum payment. Fall back to day 1 if no due day
  // has been set yet.
  if (debt.balance <= 0 || minimumPayment(debt, segments, rangeStart) <= 0) return [];
  return monthlyDueOccurrences(debt.due_day ?? 1, rangeStart, rangeEnd);
}

/** Occurrences for a dated (subscription) expense; undated budget expenses produce none. */
export function getExpenseOccurrences(expense: Expense, rangeStart: Date, rangeEnd: Date): Date[] {
  if (expense.due_day == null) return [];
  return monthlyDueOccurrences(expense.due_day, rangeStart, rangeEnd);
}

/** Every obligation occurrence in [rangeStart, rangeEnd], sorted by date. */
export function getObligations(
  bills: Bill[],
  debts: Debt[],
  expenses: Expense[],
  rangeStart: Date,
  rangeEnd: Date,
  segments: DebtSegment[] = []
): Obligation[] {
  const obligations: Obligation[] = [];

  for (const bill of bills) {
    for (const date of getBillOccurrences(bill, rangeStart, rangeEnd)) {
      obligations.push({
        type: "bill",
        id: bill.id,
        name: bill.name,
        amount: bill.amount,
        date: iso(date),
        category: bill.category,
        userId: bill.user_id,
      });
    }
  }

  for (const debt of debts) {
    for (const date of getDebtOccurrences(debt, rangeStart, rangeEnd, segments)) {
      // A calculated minimum is billed against the balance in that month, so
      // each occurrence is priced on its own date rather than on today's.
      const amount =
        debt.type === "bnpl"
          ? debt.installment_amount ?? 0
          : minimumPayment(debt, segments, date);
      obligations.push({
        type: "debt",
        id: debt.id,
        name: debt.name,
        amount,
        date: iso(date),
        category: debt.type === "bnpl" ? "BNPL" : "debt payment",
        userId: debt.user_id,
      });
    }
  }

  for (const expense of expenses) {
    for (const date of getExpenseOccurrences(expense, rangeStart, rangeEnd)) {
      obligations.push({
        type: "expense",
        id: expense.id,
        name: expense.name,
        amount: expense.amount,
        date: iso(date),
        category: expense.category,
        userId: expense.user_id,
      });
    }
  }

  obligations.sort((a, b) => a.date.localeCompare(b.date));
  return obligations;
}

/** Monthly budgeted total from undated (pure budget) expenses. */
export function monthlyBudgetExpenses(expenses: Expense[]): number {
  return expenses
    .filter((e) => e.due_day == null)
    .reduce((total, e) => total + e.amount, 0);
}

/** Total monthly expense budget (dated + undated), for cash-flow math. */
export function monthlyExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, e) => total + e.amount, 0);
}
