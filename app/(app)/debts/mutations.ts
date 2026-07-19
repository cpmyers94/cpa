import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths } from "date-fns";
import type { Debt, DebtType, InstallmentFrequency } from "@/lib/supabase/types";

export async function addDebt(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  const type = String(formData.get("type")) as DebtType;

  if (type === "bnpl") {
    // BNPL: fixed installments, interest baked in. Balance is derived.
    const installment = Number(formData.get("installment_amount"));
    const remaining = Number(formData.get("payments_remaining"));
    await supabase.from("debts").insert({
      user_id: userId,
      name: String(formData.get("name")),
      type,
      balance: Math.round(installment * remaining * 100) / 100,
      interest_rate: 0,
      minimum_payment: 0,
      installment_amount: installment,
      payments_remaining: remaining,
      installment_frequency: String(
        formData.get("installment_frequency")
      ) as InstallmentFrequency,
      next_payment_date: String(formData.get("next_payment_date")) || null,
    });
    return;
  }

  await supabase.from("debts").insert({
    user_id: userId,
    name: String(formData.get("name")),
    type,
    balance: Number(formData.get("balance")),
    interest_rate: Number(formData.get("interest_rate") || 0),
    minimum_payment: Number(formData.get("minimum_payment") || 0),
    due_day: formData.get("due_day") ? Number(formData.get("due_day")) : null,
  });
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
  const remaining = Math.max((debt.payments_remaining ?? 0) - 1, 0);

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
    })
    .eq("id", debt.id);
}
