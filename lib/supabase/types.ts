export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DeductionKind = "pretax" | "tax" | "posttax";
export type BillFrequency = "weekly" | "biweekly" | "monthly" | "yearly" | "one_time";
export type DebtType =
  | "credit_card"
  | "student_loan"
  | "auto_loan"
  | "personal_loan"
  | "mortgage"
  | "medical"
  | "bnpl"
  | "other";

export type InstallmentFrequency = "weekly" | "biweekly" | "monthly";
export type SegmentKind = "purchase" | "balance_transfer" | "cash_advance";
/** How a card's monthly minimum is arrived at. */
export type MinimumRule = "manual" | "percent_plus_interest" | "percent_of_balance";
/** How a card carries its balance — the shape the user picks on the debt form. */
export type CardStructure = "simple" | "transfer" | "transfer_and_purchases";

interface Owned {
  user_id: string;
  household_id: string | null;
}

export interface IncomeSource extends Owned {
  id: string;
  name: string;
  gross_amount: number;
  frequency: PayFrequency;
  anchor_date: string | null;
  semimonthly_days: number[] | null;
  monthly_day: number | null;
  active: boolean;
  created_at: string;
}

export interface PaycheckDeduction extends Owned {
  id: string;
  income_source_id: string;
  label: string;
  kind: DeductionKind;
  amount: number;
  created_at: string;
}

export interface Bill extends Owned {
  id: string;
  name: string;
  amount: number;
  category: string;
  frequency: BillFrequency;
  due_day: number | null;
  due_date: string | null;
  autopay: boolean;
  active: boolean;
  created_at: string;
}

export type ObligationType = "bill" | "debt" | "expense";

/**
 * Ties one obligation occurrence (a bill, a debt payment, or a dated expense)
 * to a specific paycheck. Exactly one of bill_id / debt_id / expense_id is set;
 * `bill_due_date` is the occurrence date for all three.
 */
export interface ObligationAllocation extends Owned {
  id: string;
  bill_id: string | null;
  debt_id: string | null;
  expense_id: string | null;
  income_source_id: string;
  paycheck_date: string;
  bill_due_date: string;
  created_at: string;
}

export interface Expense extends Owned {
  id: string;
  name: string;
  amount: number; // budgeted per month
  category: string;
  is_subscription: boolean;
  due_day: number | null; // set => dated monthly charge, enters paycheck planning
  active: boolean;
  created_at: string;
}

export interface SavingsGoal extends Owned {
  id: string;
  name: string;
  target_amount: number | null;
  current_amount: number;
  target_date: string | null;
  per_paycheck_contribution: number | null;
  created_at: string;
}

export interface GoalContribution extends Owned {
  id: string;
  goal_id: string;
  amount: number;
  contributed_on: string;
  note: string | null;
  created_at: string;
}

export interface Debt extends Owned {
  id: string;
  name: string;
  type: DebtType;
  balance: number;
  interest_rate: number;
  /** True when the user set the APR themselves — never overwrite a manual rate. */
  apr_manual: boolean;
  /** Only meaningful when `minimum_rule` is "manual"; otherwise it's derived. */
  minimum_payment: number;
  minimum_rule: MinimumRule;
  /** Percent of balance the issuer asks for. Null falls back to the default. */
  minimum_percent: number | null;
  /** The smallest the issuer will bill. Null falls back to the default. */
  minimum_floor: number | null;
  /** The card's credit line. Null for anything that isn't revolving. */
  credit_limit: number | null;
  due_day: number | null;
  // BNPL-only fields: fixed installments on a fixed schedule.
  installment_amount: number | null;
  payments_remaining: number | null;
  installment_frequency: InstallmentFrequency | null;
  next_payment_date: string | null;
  // Early-payoff / settlement amount — what it costs to clear the plan today
  // (less than the remaining installments for interest-bearing BNPL). Null =
  // no discount known, so the scheduled total stands in.
  settlement_amount: number | null;
  created_at: string;
}

/**
 * One balance bucket on a card, at its own rate. Where a card has segments they
 * are the source of truth: `Debt.balance` and `Debt.interest_rate` are derived
 * from them rather than typed separately.
 */
export interface DebtSegment extends Owned {
  id: string;
  debt_id: string;
  kind: SegmentKind;
  balance: number;
  /** The rate charged today. On a promo segment this is the promo rate. */
  apr: number;
  /** When `apr` stops applying. Null = no promo, the rate is permanent. */
  promo_ends_on: string | null;
  /** The rate this segment reverts to once the promo ends. */
  post_promo_apr: number | null;
  position: number;
  created_at: string;
}

export interface DebtPayment extends Owned {
  id: string;
  debt_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
}

export interface SnowballPayment extends Owned {
  id: string;
  debt_id: string;
  income_source_id: string;
  paycheck_date: string;
  amount: number;
  created_at: string;
}

export interface PlanSettings {
  household_id: string;
  user_id: string;
  strategy: "avalanche" | "snowball" | "utilization";
  extra_override: number | null;
  /** Percent of each card's limit the utilization strategy aims to get under. */
  utilization_target: number;
  updated_at: string;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  shared_editing: boolean;
  created_at: string;
}

export interface HouseholdMember {
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  email: string | null;
  isSelf: boolean;
}
