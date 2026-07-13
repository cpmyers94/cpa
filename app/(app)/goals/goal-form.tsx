"use client";

import { addGoal } from "./actions";
import { inputClass, buttonClass } from "@/components/card";

export function GoalForm() {
  return (
    <form action={addGoal} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input name="name" placeholder="Goal name" required className={`${inputClass} col-span-2 sm:col-span-1`} />
      <input name="target_amount" type="number" step="0.01" min="0" placeholder="Target amount" required className={inputClass} />
      <input name="current_amount" type="number" step="0.01" min="0" placeholder="Starting amount" className={inputClass} />
      <input name="monthly_contribution" type="number" step="0.01" min="0" placeholder="Monthly contribution" className={inputClass} />
      <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
        Target date (optional)
        <input name="target_date" type="date" className={inputClass} />
      </label>
      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add goal
      </button>
    </form>
  );
}
