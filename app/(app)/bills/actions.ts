"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/user";
import type { BillFrequency } from "@/lib/supabase/types";

export async function addBill(formData: FormData) {
  const { supabase, user } = await requireUser();
  const frequency = String(formData.get("frequency")) as BillFrequency;

  await supabase.from("bills").insert({
    user_id: user.id,
    name: String(formData.get("name")),
    amount: Number(formData.get("amount")),
    category: String(formData.get("category") || "other"),
    frequency,
    due_day: frequency === "monthly" ? Number(formData.get("due_day")) : null,
    due_date:
      frequency === "monthly" ? null : String(formData.get("due_date")) || null,
    autopay: formData.get("autopay") === "on",
  });

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function deleteBill(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("bills").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function allocateBill(formData: FormData) {
  const { supabase, user } = await requireUser();

  const [incomeSourceId, paycheckDate] = String(formData.get("paycheck")).split("|");
  if (!incomeSourceId || !paycheckDate) return;

  await supabase.from("bill_allocations").upsert(
    {
      user_id: user.id,
      bill_id: String(formData.get("bill_id")),
      bill_due_date: String(formData.get("bill_due_date")),
      income_source_id: incomeSourceId,
      paycheck_date: paycheckDate,
    },
    { onConflict: "bill_id,bill_due_date" }
  );

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function unallocateBill(formData: FormData) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("bill_allocations")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/calendar");
}
