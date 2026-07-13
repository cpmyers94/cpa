import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillFrequency } from "@/lib/supabase/types";

export async function addBill(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  const frequency = String(formData.get("frequency")) as BillFrequency;

  await supabase.from("bills").insert({
    user_id: userId,
    name: String(formData.get("name")),
    amount: Number(formData.get("amount")),
    category: String(formData.get("category") || "other"),
    frequency,
    due_day: frequency === "monthly" ? Number(formData.get("due_day")) : null,
    due_date: frequency === "monthly" ? null : String(formData.get("due_date")) || null,
    autopay: formData.get("autopay") === "on",
  });
}

export async function deleteBill(supabase: SupabaseClient, id: string) {
  await supabase.from("bills").delete().eq("id", id);
}

export async function allocateBill(
  supabase: SupabaseClient,
  userId: string,
  billId: string,
  billDueDate: string,
  incomeSourceId: string,
  paycheckDate: string
) {
  await supabase.from("bill_allocations").upsert(
    {
      user_id: userId,
      bill_id: billId,
      bill_due_date: billDueDate,
      income_source_id: incomeSourceId,
      paycheck_date: paycheckDate,
    },
    { onConflict: "bill_id,bill_due_date" }
  );
}

export async function unallocateBill(supabase: SupabaseClient, id: string) {
  await supabase.from("bill_allocations").delete().eq("id", id);
}
