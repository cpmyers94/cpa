"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import type { IncomeSource } from "@/lib/supabase/types";
import { addIncomeSource, updateIncomeSource } from "./mutations";

export function IncomeSourceForm({
  editing,
  onChanged,
  onDone,
}: {
  editing?: IncomeSource;
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();
  const [frequency, setFrequency] = useState<string>(editing?.frequency ?? "biweekly");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateIncomeSource(supabase, editing.id, formData);
    } else {
      await addIncomeSource(supabase, user.id, formData);
      form.reset();
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input
        name="name"
        placeholder="Job name"
        required
        defaultValue={editing?.name}
        className={`${inputClass} col-span-2`}
      />
      <input
        name="gross_amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Gross amount"
        required
        defaultValue={editing?.gross_amount ?? undefined}
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
          <input
            name="anchor_date"
            type="date"
            required
            defaultValue={editing?.anchor_date ?? undefined}
            className={inputClass}
          />
        </label>
      )}
      {frequency === "semimonthly" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Pay days of month (comma separated)
          <input
            name="semimonthly_days"
            defaultValue={editing?.semimonthly_days?.join(",") ?? "1,15"}
            className={inputClass}
          />
        </label>
      )}
      {frequency === "monthly" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Pay day of month
          <input
            name="monthly_day"
            type="number"
            min="1"
            max="31"
            defaultValue={editing?.monthly_day ?? 1}
            className={inputClass}
          />
        </label>
      )}

      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="submit" className={`${buttonClass} flex-1`}>
          {editing ? "Save" : "Add income source"}
        </button>
        {editing && onDone && (
          <button type="button" onClick={onDone} className={ghostButtonClass}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
