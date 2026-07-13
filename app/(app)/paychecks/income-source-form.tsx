"use client";

import { useState } from "react";
import { addIncomeSource } from "./actions";
import { inputClass, buttonClass } from "@/components/card";

export function IncomeSourceForm() {
  const [frequency, setFrequency] = useState("biweekly");

  return (
    <form action={addIncomeSource} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input name="name" placeholder="Job name" required className={`${inputClass} col-span-2`} />
      <input
        name="gross_amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Gross amount"
        required
        className={inputClass}
      />
      <select
        name="frequency"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value)}
        className={inputClass}
      >
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
        <option value="semimonthly">Semimonthly</option>
        <option value="monthly">Monthly</option>
      </select>

      {(frequency === "weekly" || frequency === "biweekly") && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          A recent pay date
          <input name="anchor_date" type="date" required className={inputClass} />
        </label>
      )}
      {frequency === "semimonthly" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Pay days of month (comma separated)
          <input name="semimonthly_days" defaultValue="1,15" className={inputClass} />
        </label>
      )}
      {frequency === "monthly" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Pay day of month
          <input name="monthly_day" type="number" min="1" max="31" defaultValue="1" className={inputClass} />
        </label>
      )}

      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add income source
      </button>
    </form>
  );
}
