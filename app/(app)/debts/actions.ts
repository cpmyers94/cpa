"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/user";
import type { DebtType } from "@/lib/supabase/types";

export async function addDebt(formData: FormData) {
  const { supabase, user } = await requireUser();

  await supabase.from("debts").insert({
    user_id: user.id,
    name: String(formData.get("name")),
    type: String(formData.get("type")) as DebtType,
    balance: Number(formData.get("balance")),
    interest_rate: Number(formData.get("interest_rate") || 0),
    minimum_payment: Number(formData.get("minimum_payment") || 0),
    due_day: formData.get("due_day") ? Number(formData.get("due_day")) : null,
  });

  revalidatePath("/debts");
  revalidatePath("/");
}

export async function deleteDebt(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("debts").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);

  revalidatePath("/debts");
  revalidatePath("/");
}

export async function addPayment(formData: FormData) {
  const { supabase, user } = await requireUser();
  const debtId = String(formData.get("debt_id"));
  const amount = Number(formData.get("amount"));

  const { data: debt } = await supabase
    .from("debts")
    .select("balance")
    .eq("id", debtId)
    .eq("user_id", user.id)
    .single();

  if (!debt) return;

  await supabase.from("debt_payments").insert({
    user_id: user.id,
    debt_id: debtId,
    amount,
    note: String(formData.get("note") || "") || null,
  });

  await supabase
    .from("debts")
    .update({ balance: Math.max(Number(debt.balance) - amount, 0) })
    .eq("id", debtId)
    .eq("user_id", user.id);

  revalidatePath("/debts");
  revalidatePath("/");
}
