"use client";

import { useState } from "react";
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
  // A "pool" is general savings with no target (e.g. an emergency fund / cash
  // cushion); a "goal" saves toward a target amount and date.
  const [kind, setKind] = useState<"goal" | "pool">(
    editing ? (editing.target_amount == null ? "pool" : "goal") : "goal"
  );
  const isPool = kind === "pool";

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
      setKind("goal");
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-800/60">
        {(["goal", "pool"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              kind === k
                ? "bg-white shadow-sm dark:bg-neutral-900"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {k === "goal" ? "Goal with target" : "General savings"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input
          name="name"
          placeholder={isPool ? "e.g. Emergency fund" : "Goal name"}
          required
          defaultValue={editing?.name}
          className={`${inputClass} col-span-2 sm:col-span-1`}
        />
        {!isPool && (
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
        )}
        <input
          name="current_amount"
          type="number"
          step="0.01"
          min="0"
          placeholder={isPool ? "Amount saved" : editing ? "Saved so far" : "Starting amount"}
          defaultValue={editing?.current_amount ?? undefined}
          className={inputClass}
        />
        <input
          name="per_paycheck_contribution"
          type="number"
          step="0.01"
          min="0"
          placeholder="Per paycheck"
          defaultValue={editing?.per_paycheck_contribution ?? undefined}
          className={inputClass}
        />
        {!isPool && (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Target date (optional)
            <input
              name="target_date"
              type="date"
              defaultValue={editing?.target_date ?? undefined}
              className={inputClass}
            />
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className={buttonClass}>
          {editing ? "Save" : isPool ? "Add savings" : "Add goal"}
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
