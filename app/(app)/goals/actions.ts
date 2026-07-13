"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/user";

export async function addGoal(formData: FormData) {
  const { supabase, user } = await requireUser();

  await supabase.from("savings_goals").insert({
    user_id: user.id,
    name: String(formData.get("name")),
    target_amount: Number(formData.get("target_amount")),
    current_amount: Number(formData.get("current_amount") || 0),
    target_date: String(formData.get("target_date")) || null,
    monthly_contribution: formData.get("monthly_contribution")
      ? Number(formData.get("monthly_contribution"))
      : null,
  });

  revalidatePath("/goals");
  revalidatePath("/");
}

export async function deleteGoal(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("savings_goals").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);

  revalidatePath("/goals");
  revalidatePath("/");
}

export async function addContribution(formData: FormData) {
  const { supabase, user } = await requireUser();
  const goalId = String(formData.get("goal_id"));
  const amount = Number(formData.get("amount"));

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("current_amount")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();

  if (!goal) return;

  await supabase.from("goal_contributions").insert({
    user_id: user.id,
    goal_id: goalId,
    amount,
    note: String(formData.get("note") || "") || null,
  });

  await supabase
    .from("savings_goals")
    .update({ current_amount: Number(goal.current_amount) + amount })
    .eq("id", goalId)
    .eq("user_id", user.id);

  revalidatePath("/goals");
  revalidatePath("/");
}
