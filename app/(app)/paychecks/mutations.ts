import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeductionKind, PayFrequency } from "@/lib/supabase/types";

export async function addIncomeSource(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  const frequency = String(formData.get("frequency")) as PayFrequency;
  const semimonthlyDays =
    frequency === "semimonthly"
      ? String(formData.get("semimonthly_days") || "1,15")
          .split(",")
          .map((d) => parseInt(d.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : null;

  await supabase.from("income_sources").insert({
    user_id: userId,
    name: String(formData.get("name")),
    gross_amount: Number(formData.get("gross_amount")),
    frequency,
    anchor_date:
      frequency === "weekly" || frequency === "biweekly"
        ? String(formData.get("anchor_date")) || null
        : null,
    semimonthly_days: semimonthlyDays,
    monthly_day: frequency === "monthly" ? Number(formData.get("monthly_day")) : null,
  });
}

export async function deleteIncomeSource(supabase: SupabaseClient, id: string) {
  await supabase.from("income_sources").delete().eq("id", id);
}

export async function addDeduction(
  supabase: SupabaseClient,
  userId: string,
  incomeSourceId: string,
  formData: FormData
) {
  await supabase.from("paycheck_deductions").insert({
    user_id: userId,
    income_source_id: incomeSourceId,
    label: String(formData.get("label")),
    kind: String(formData.get("kind")) as DeductionKind,
    amount: Number(formData.get("amount")),
  });
}

export async function deleteDeduction(supabase: SupabaseClient, id: string) {
  await supabase.from("paycheck_deductions").delete().eq("id", id);
}
