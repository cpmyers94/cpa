"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass } from "@/components/card";
import { addBill } from "./mutations";

export function BillForm({ onChanged }: { onChanged: () => void }) {
  const { supabase, user } = useAuth();
  const [frequency, setFrequency] = useState("monthly");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    await addBill(supabase, user.id, new FormData(form));
    form.reset();
    setFrequency("monthly");
    onChanged();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input name="name" placeholder="Bill name" required className={`${inputClass} col-span-2 sm:col-span-1`} />
      <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className={inputClass} />
      <input name="category" placeholder="Category" defaultValue="other" className={inputClass} />
      <select
        name="frequency"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value)}
        className={inputClass}
      >
        <option value="monthly">Monthly</option>
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
        <option value="yearly">Yearly</option>
        <option value="one_time">One time</option>
      </select>

      {frequency === "monthly" ? (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Due day of month
          <input name="due_day" type="number" min="1" max="31" defaultValue="1" className={inputClass} />
        </label>
      ) : (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          {frequency === "one_time" ? "Due date" : "A recent due date"}
          <input name="due_date" type="date" required className={inputClass} />
        </label>
      )}

      <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-500 sm:col-span-1">
        <input name="autopay" type="checkbox" />
        Autopay
      </label>
      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add bill
      </button>
    </form>
  );
}
