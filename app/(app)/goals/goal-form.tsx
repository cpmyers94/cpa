"use client";

import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import type { SavingsGoal } from "@/lib/supabase/types";
import { addGoal, updateGoal } from "./mutations";

export function GoalForm({
  editing,
  onChanged,
  onDone,
}: {
  editing?: SavingsGoal;
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateGoal(supabase, editing.id, formData);
    } else {
      await addGoal(supabase, user.id, formData);
      form.reset();
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input
        name="name"
        placeholder="Goal name"
        required
        defaultValue={editing?.name}
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
      <input
        name="target_amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Target amount"
        required
        defaultValue={editing?.target_amount ?? undefined}
        className={inputClass}
      />
      <input
        name="current_amount"
        type="number"
        step="0.01"
        min="0"
        placeholder={editing ? "Saved so far" : "Starting amount"}
        defaultValue={editing?.current_amount ?? undefined}
        className={inputClass}
      />
      <input
        name="monthly_contribution"
        type="number"
        step="0.01"
        min="0"
        placeholder="Monthly contribution"
        defaultValue={editing?.monthly_contribution ?? undefined}
        className={inputClass}
      />
      <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
        Target date (optional)
        <input
          name="target_date"
          type="date"
          defaultValue={editing?.target_date ?? undefined}
          className={inputClass}
        />
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="submit" className={`${buttonClass} flex-1`}>
          {editing ? "Save" : "Add goal"}
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
