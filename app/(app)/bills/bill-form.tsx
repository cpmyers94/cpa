"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import type { Bill } from "@/lib/supabase/types";
import { addBill, updateBill } from "./mutations";

export function BillForm({
  editing,
  onChanged,
  onDone,
}: {
  editing?: Bill;
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();
  const [frequency, setFrequency] = useState<string>(editing?.frequency ?? "monthly");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateBill(supabase, editing.id, formData);
    } else {
      await addBill(supabase, user.id, formData);
      form.reset();
      setFrequency("monthly");
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input
        name="name"
        placeholder="Bill name"
        required
        defaultValue={editing?.name}
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Amount"
        required
        defaultValue={editing?.amount ?? undefined}
        className={inputClass}
      />
      <input
        name="category"
        placeholder="Category"
        defaultValue={editing?.category ?? "other"}
        className={inputClass}
      />
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
          <input
            name="due_day"
            type="number"
            min="1"
            max="31"
            defaultValue={editing?.due_day ?? 1}
            className={inputClass}
          />
        </label>
      ) : (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          {frequency === "one_time" ? "Due date" : "A recent due date"}
          <input
            name="due_date"
            type="date"
            required
            defaultValue={editing?.due_date ?? undefined}
            className={inputClass}
          />
        </label>
      )}

      <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-500 sm:col-span-1">
        <input name="autopay" type="checkbox" defaultChecked={editing?.autopay ?? false} />
        Autopay
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="submit" className={`${buttonClass} flex-1`}>
          {editing ? "Save" : "Add bill"}
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
