import type { SupabaseClient } from "@supabase/supabase-js";

/** Commits an extra debt payment to a specific paycheck. */
export async function assignSnowballPayment(
  supabase: SupabaseClient,
  userId: string,
  payment: {
    debtId: string;
    incomeSourceId: string;
    paycheckDate: string;
    amount: number;
  }
) {
  await supabase.from("snowball_payments").insert({
    user_id: userId,
    debt_id: payment.debtId,
    income_source_id: payment.incomeSourceId,
    paycheck_date: payment.paycheckDate,
    amount: payment.amount,
  });
}

export async function unassignSnowballPayment(supabase: SupabaseClient, id: string) {
  await supabase.from("snowball_payments").delete().eq("id", id);
}
