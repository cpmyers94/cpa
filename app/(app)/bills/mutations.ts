import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillFrequency, ObligationType } from "@/lib/supabase/types";

const OBLIGATION_COLUMN: Record<ObligationType, "bill_id" | "debt_id" | "expense_id"> = {
  bill: "bill_id",
  debt: "debt_id",
  expense: "expense_id",
};

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

/**
 * Assigns one obligation occurrence (bill / debt payment / dated expense) to a
 * paycheck. Delete-then-insert keeps it to a single allocation per occurrence
 * without depending on a partial-index upsert target.
 */
export async function allocateObligation(
  supabase: SupabaseClient,
  userId: string,
  type: ObligationType,
  obligationId: string,
  occurrenceDate: string,
  incomeSourceId: string,
  paycheckDate: string
) {
  const column = OBLIGATION_COLUMN[type];
  await supabase
    .from("bill_allocations")
    .delete()
    .eq(column, obligationId)
    .eq("bill_due_date", occurrenceDate);
  await supabase.from("bill_allocations").insert({
    user_id: userId,
    [column]: obligationId,
    bill_due_date: occurrenceDate,
    income_source_id: incomeSourceId,
    paycheck_date: paycheckDate,
  });
}

export async function unallocateObligation(supabase: SupabaseClient, id: string) {
  await supabase.from("bill_allocations").delete().eq("id", id);
}
