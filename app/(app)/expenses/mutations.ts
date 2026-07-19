import type { SupabaseClient } from "@supabase/supabase-js";

function expensePayload(formData: FormData) {
  const isSubscription = formData.get("is_subscription") === "on";
  const dueDayRaw = formData.get("due_day");
  return {
    name: String(formData.get("name")),
    amount: Number(formData.get("amount")),
    category: String(formData.get("category") || "other"),
    is_subscription: isSubscription,
    // Only dated subscriptions carry a due day (and thus enter paycheck planning).
    due_day: isSubscription && dueDayRaw ? Number(dueDayRaw) : null,
  };
}

export async function addExpense(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  await supabase.from("expenses").insert({ user_id: userId, ...expensePayload(formData) });
}

export async function updateExpense(
  supabase: SupabaseClient,
  id: string,
  formData: FormData
) {
  await supabase.from("expenses").update(expensePayload(formData)).eq("id", id);
}

export async function deleteExpense(supabase: SupabaseClient, id: string) {
  await supabase.from("expenses").delete().eq("id", id);
}
