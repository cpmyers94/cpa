import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths } from "date-fns";
import { buildDebtPayload } from "@/lib/debts/payload";
import type { Debt, DebtType, InstallmentFrequency } from "@/lib/supabase/types";

const num = (v: FormDataEntryValue | null) => (v ? Number(v) : null);

/** Maps the form into the shared payload builder used by every debt writer. */
function debtPayload(formData: FormData) {
  return buildDebtPayload({
    name: String(formData.get("name")),
    type: String(formData.get("type")) as DebtType,
    balance: num(formData.get("balance")),
    interest_rate: num(formData.get("interest_rate")),
    // An APR typed into the form is the user's own — it outranks any derived
    // rate from then on. Clearing the field hands it back to derivation.
    apr_manual: Boolean(formData.get("interest_rate")),
    minimum_payment: num(formData.get("minimum_payment")),
    due_day: num(formData.get("due_day")),
    installment_amount: num(formData.get("installment_amount")),
    payments_remaining: num(formData.get("payments_remaining")),
    installment_frequency: (String(formData.get("installment_frequency")) ||
      null) as InstallmentFrequency | null,
    next_payment_date: String(formData.get("next_payment_date")) || null,
    settlement_amount: num(formData.get("settlement_amount")),
    scheduled_balance: num(formData.get("scheduled_balance")),
  });
}

export async function addDebt(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  await supabase.from("debts").insert({ user_id: userId, ...debtPayload(formData) });
}

export async function updateDebt(
  supabase: SupabaseClient,
  id: string,
  formData: FormData
) {
  await supabase.from("debts").update(debtPayload(formData)).eq("id", id);
}

export async function deleteDebt(supabase: SupabaseClient, id: string) {
  await supabase.from("debts").delete().eq("id", id);
}

export async function addPayment(
  supabase: SupabaseClient,
  userId: string,
  debtId: string,
  currentBalance: number,
  amount: number
) {
  await supabase.from("debt_payments").insert({
    user_id: userId,
    debt_id: debtId,
    amount,
  });

  await supabase
    .from("debts")
    .update({ balance: Math.max(currentBalance - amount, 0) })
    .eq("id", debtId);
}

/** Logs one BNPL installment: records the payment, ticks the plan forward. */
export async function payBnplInstallment(
  supabase: SupabaseClient,
  userId: string,
  debt: Debt
) {
  const installment = debt.installment_amount ?? 0;
  const before = debt.payments_remaining ?? 0;
  const remaining = Math.max(before - 1, 0);
  // Settling early gets cheaper as installments are paid; amortize the payoff
  // down so it lands on 0 with the final installment.
  const settlement =
    debt.settlement_amount == null || before <= 0
      ? debt.settlement_amount
      : Math.round(((debt.settlement_amount * remaining) / before) * 100) / 100;

  await supabase.from("debt_payments").insert({
    user_id: userId,
    debt_id: debt.id,
    amount: installment,
  });

  let nextDate: string | null = null;
  if (remaining > 0 && debt.next_payment_date) {
    const current = new Date(debt.next_payment_date);
    const next =
      debt.installment_frequency === "weekly"
        ? addDays(current, 7)
        : debt.installment_frequency === "biweekly"
          ? addDays(current, 14)
          : addMonths(current, 1);
    nextDate = next.toISOString().slice(0, 10);
  }

  await supabase
    .from("debts")
    .update({
      balance: Math.max(Math.round((debt.balance - installment) * 100) / 100, 0),
      payments_remaining: remaining,
      next_payment_date: nextDate,
      settlement_amount: settlement,
    })
    .eq("id", debt.id);
}
