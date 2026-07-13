import type { SupabaseClient } from "@supabase/supabase-js";
import type { DebtType } from "@/lib/supabase/types";

export async function addDebt(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  await supabase.from("debts").insert({
    user_id: userId,
    name: String(formData.get("name")),
    type: String(formData.get("type")) as DebtType,
    balance: Number(formData.get("balance")),
    interest_rate: Number(formData.get("interest_rate") || 0),
    minimum_payment: Number(formData.get("minimum_payment") || 0),
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
