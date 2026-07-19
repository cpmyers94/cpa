import type { SupabaseClient } from "@supabase/supabase-js";

export async function addExpense(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  const isSubscription = formData.get("is_subscription") === "on";
  const dueDayRaw = formData.get("due_day");

  await supabase.from("expenses").insert({
    user_id: userId,
    name: String(formData.get("name")),
    amount: Number(formData.get("amount")),
    category: String(formData.get("category") || "other"),
    is_subscription: isSubscription,
    // Only dated subscriptions carry a due day (and thus enter paycheck planning).
    due_day: isSubscription && dueDayRaw ? Number(dueDayRaw) : null,
  });
}

export async function deleteExpense(supabase: SupabaseClient, id: string) {
  await supabase.from("expenses").delete().eq("id", id);
}
