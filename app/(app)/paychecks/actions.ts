"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/user";
import type { PayFrequency, DeductionKind } from "@/lib/supabase/types";

export async function addIncomeSource(formData: FormData) {
  const { supabase, user } = await requireUser();

  const frequency = String(formData.get("frequency")) as PayFrequency;
  const semimonthlyDays =
    frequency === "semimonthly"
      ? String(formData.get("semimonthly_days") || "1,15")
          .split(",")
          .map((d) => parseInt(d.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : null;

  await supabase.from("income_sources").insert({
    user_id: user.id,
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

  revalidatePath("/paychecks");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function deleteIncomeSource(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("income_sources")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/paychecks");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function addDeduction(formData: FormData) {
  const { supabase, user } = await requireUser();

  await supabase.from("paycheck_deductions").insert({
    user_id: user.id,
    income_source_id: String(formData.get("income_source_id")),
    label: String(formData.get("label")),
    kind: String(formData.get("kind")) as DeductionKind,
    amount: Number(formData.get("amount")),
  });

  revalidatePath("/paychecks");
  revalidatePath("/");
}

export async function deleteDeduction(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("paycheck_deductions")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/paychecks");
  revalidatePath("/");
}
