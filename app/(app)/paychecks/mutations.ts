import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import { snapToOccurrence } from "@/lib/calc/allocate";
import type { DeductionKind, IncomeSource, PayFrequency } from "@/lib/supabase/types";

type ScheduleFields = Pick<
  IncomeSource,
  "frequency" | "anchor_date" | "semimonthly_days" | "monthly_day"
>;

function scheduleChanged(prev: ScheduleFields, next: ScheduleFields): boolean {
  return (
    prev.frequency !== next.frequency ||
    (prev.anchor_date ?? null) !== (next.anchor_date ?? null) ||
    (prev.semimonthly_days ?? []).join(",") !== (next.semimonthly_days ?? []).join(",") ||
    (prev.monthly_day ?? null) !== (next.monthly_day ?? null)
  );
}

/**
 * When a source's pay schedule changes, its paydays move — so every allocation
 * pinned to an old paycheck date must be re-pointed at the corresponding new
 * payday, or it silently stops flowing into the plan. Snap each allocation to
 * the nearest occurrence of the new schedule; drop the ones that no longer map
 * to any real paycheck.
 */
async function remapAllocations(
  supabase: SupabaseClient,
  sourceId: string,
  next: ScheduleFields
) {
  const { data } = await supabase
    .from("bill_allocations")
    .select("id, paycheck_date")
    .eq("income_source_id", sourceId);
  const allocations = (data ?? []) as { id: string; paycheck_date: string }[];
  if (allocations.length === 0) return;

  const dates = allocations.map((a) => a.paycheck_date).sort();
  const lo = addDays(new Date(`${dates[0]}T00:00:00Z`), -60);
  const hi = addDays(new Date(`${dates[dates.length - 1]}T00:00:00Z`), 60);
  const occurrences = getPaycheckOccurrences(next, lo, hi).map((d) => d.toISOString().slice(0, 10));

  for (const allocation of allocations) {
    const snapped = snapToOccurrence(allocation.paycheck_date, occurrences);
    if (snapped === null) {
      await supabase.from("bill_allocations").delete().eq("id", allocation.id);
    } else if (snapped !== allocation.paycheck_date) {
      await supabase
        .from("bill_allocations")
        .update({ paycheck_date: snapped })
        .eq("id", allocation.id);
    }
  }
}

function incomeSourcePayload(formData: FormData) {
  const frequency = String(formData.get("frequency")) as PayFrequency;
  const semimonthlyDays =
    frequency === "semimonthly"
      ? String(formData.get("semimonthly_days") || "1,15")
          .split(",")
          .map((d) => parseInt(d.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : null;

  return {
    name: String(formData.get("name")),
    gross_amount: Number(formData.get("gross_amount")),
    frequency,
    anchor_date:
      frequency === "weekly" || frequency === "biweekly"
        ? String(formData.get("anchor_date")) || null
        : null,
    semimonthly_days: semimonthlyDays,
    monthly_day: frequency === "monthly" ? Number(formData.get("monthly_day")) : null,
  };
}

export async function addIncomeSource(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData
) {
  await supabase
    .from("income_sources")
    .insert({ user_id: userId, ...incomeSourcePayload(formData) });
}

export async function updateIncomeSource(
  supabase: SupabaseClient,
  id: string,
  formData: FormData,
  previous?: IncomeSource
) {
  const payload = incomeSourcePayload(formData);
  await supabase.from("income_sources").update(payload).eq("id", id);
  if (previous && scheduleChanged(previous, payload)) {
    await remapAllocations(supabase, id, payload);
  }
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

export async function updateDeduction(
  supabase: SupabaseClient,
  id: string,
  formData: FormData
) {
  await supabase
    .from("paycheck_deductions")
    .update({
      label: String(formData.get("label")),
      kind: String(formData.get("kind")) as DeductionKind,
      amount: Number(formData.get("amount")),
    })
    .eq("id", id);
}

export async function deleteDeduction(supabase: SupabaseClient, id: string) {
  await supabase.from("paycheck_deductions").delete().eq("id", id);
}
