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
  | "other";

export interface IncomeSource {
  id: string;
  user_id: string;
  name: string;
  gross_amount: number;
  frequency: PayFrequency;
  anchor_date: string | null;
  semimonthly_days: number[] | null;
  monthly_day: number | null;
  active: boolean;
  created_at: string;
}

export interface PaycheckDeduction {
  id: string;
  user_id: string;
  income_source_id: string;
  label: string;
  kind: DeductionKind;
  amount: number;
  created_at: string;
}

export interface Bill {
  id: string;
  user_id: string;
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

export interface BillAllocation {
  id: string;
  user_id: string;
  bill_id: string;
  income_source_id: string;
  paycheck_date: string;
  bill_due_date: string;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  monthly_contribution: number | null;
  created_at: string;
}

export interface GoalContribution {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number;
  contributed_on: string;
  note: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  type: DebtType;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  due_day: number | null;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  user_id: string;
  debt_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
}

