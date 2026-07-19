"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import type { Expense } from "@/lib/supabase/types";
import { addExpense, updateExpense } from "./mutations";

export function ExpenseForm({
  editing,
  onChanged,
  onDone,
}: {
  editing?: Expense;
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();
  const [isSubscription, setIsSubscription] = useState(editing?.is_subscription ?? false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateExpense(supabase, editing.id, formData);
    } else {
      await addExpense(supabase, user.id, formData);
      form.reset();
      setIsSubscription(false);
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input
        name="name"
        placeholder="Expense name"
        required
        defaultValue={editing?.name}
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Amount / month"
        required
        defaultValue={editing?.amount ?? undefined}
        className={inputClass}
      />
      <input
        name="category"
        placeholder="Category (e.g. food)"
        defaultValue={editing?.category ?? "other"}
        className={inputClass}
      />
      <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-500 sm:col-span-1">
        <input
          name="is_subscription"
          type="checkbox"
          checked={isSubscription}
          onChange={(e) => setIsSubscription(e.target.checked)}
        />
        Subscription
      </label>
      {isSubscription ? (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
          Charge day of month
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
        <div className="hidden sm:block" />
      )}
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="submit" className={`${buttonClass} flex-1`}>
          {editing ? "Save" : "Add expense"}
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
