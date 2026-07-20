import type { SupabaseClient } from "@supabase/supabase-js";

function goalPayload(formData: FormData) {
  return {
    name: String(formData.get("name")),
    target_amount: formData.get("target_amount") ? Number(formData.get("target_amount")) : null,
    current_amount: Number(formData.get("current_amount") || 0),
    target_date: formData.get("target_date") ? String(formData.get("target_date")) : null,
    monthly_contribution: formData.get("monthly_contribution")
      ? Number(formData.get("monthly_contribution"))
      : null,
  };
}

export async function addGoal(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  await supabase.from("savings_goals").insert({ user_id: userId, ...goalPayload(formData) });
}

export async function updateGoal(
  supabase: SupabaseClient,
  id: string,
  formData: FormData
) {
  await supabase.from("savings_goals").update(goalPayload(formData)).eq("id", id);
}

export async function deleteGoal(supabase: SupabaseClient, id: string) {
  await supabase.from("savings_goals").delete().eq("id", id);
}

export async function addContribution(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  currentAmount: number,
  amount: number
) {
  await supabase.from("goal_contributions").insert({
    user_id: userId,
    goal_id: goalId,
    amount,
  });

  await supabase
    .from("savings_goals")
    .update({ current_amount: currentAmount + amount })
    .eq("id", goalId);
}
