"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass } from "@/components/card";
import { addExpense } from "./mutations";

export function ExpenseForm({ onChanged }: { onChanged: () => void }) {
  const { supabase, user } = useAuth();
  const [isSubscription, setIsSubscription] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    await addExpense(supabase, user.id, new FormData(form));
    form.reset();
    setIsSubscription(false);
    onChanged();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <input name="name" placeholder="Expense name" required className={`${inputClass} col-span-2 sm:col-span-1`} />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="Amount / month"
        required
        className={inputClass}
      />
      <input name="category" placeholder="Category (e.g. food)" defaultValue="other" className={inputClass} />
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
          <input name="due_day" type="number" min="1" max="31" defaultValue="1" className={inputClass} />
        </label>
      ) : (
        <div className="hidden sm:block" />
      )}
      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add expense
      </button>
    </form>
  );
}
