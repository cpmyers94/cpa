import type { DebtType, InstallmentFrequency } from "../supabase/types";

/**
 * Plain-object debt input, shared by every surface that writes a debt: the
 * web form, and the MCP/AI tool layer. Keeping one builder means a field added
 * for one surface can't silently drift from the other.
 */
export interface DebtInput {
  name: string;
  type: DebtType;
  // Revolving (credit card, loan, …)
  balance?: number | null;
  interest_rate?: number | null;
  minimum_payment?: number | null;
  due_day?: number | null;
  // BNPL
  installment_amount?: number | null;
  payments_remaining?: number | null;
  installment_frequency?: InstallmentFrequency | null;
  next_payment_date?: string | null;
  /** Early-payoff figure from the lender (less than the scheduled total). */
  settlement_amount?: number | null;
  /**
   * The lender's real remaining balance. BNPL final payments are often a small
   * stub rather than a full installment, so installment × payments overstates
   * it — when this is given it wins.
   */
  scheduled_balance?: number | null;
}

export interface DebtColumns {
  name: string;
  type: DebtType;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  due_day: number | null;
  installment_amount: number | null;
  payments_remaining: number | null;
  installment_frequency: InstallmentFrequency | null;
  next_payment_date: string | null;
  settlement_amount: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Builds the debt column values from plain fields, shared by every writer. */
export function buildDebtPayload(input: DebtInput): DebtColumns {
  if (input.type === "bnpl") {
    const installment = Number(input.installment_amount ?? 0);
    const remaining = Number(input.payments_remaining ?? 0);
    return {
      name: input.name,
      type: input.type,
      balance:
        input.scheduled_balance != null
          ? Number(input.scheduled_balance)
          : round2(installment * remaining),
      interest_rate: 0,
      minimum_payment: 0,
      due_day: null,
      installment_amount: installment,
      payments_remaining: remaining,
      installment_frequency: (input.installment_frequency ??
        "monthly") as InstallmentFrequency,
      next_payment_date: input.next_payment_date || null,
      settlement_amount:
        input.settlement_amount == null ? null : Number(input.settlement_amount),
    };
  }

  return {
    name: input.name,
    type: input.type,
    balance: Number(input.balance ?? 0),
    interest_rate: Number(input.interest_rate ?? 0),
    minimum_payment: Number(input.minimum_payment ?? 0),
    due_day: input.due_day == null ? null : Number(input.due_day),
    installment_amount: null,
    payments_remaining: null,
    installment_frequency: null,
    next_payment_date: null,
    settlement_amount: null,
  };
}
