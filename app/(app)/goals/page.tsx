"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card, inputClass, ghostButtonClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import type { SavingsGoal } from "@/lib/supabase/types";
import { GoalForm } from "./goal-form";
import { addContribution, deleteGoal } from "./mutations";

function monthsUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const now = new Date();
  const target = new Date(targetDate);
  return Math.max(
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
    0
  );
}

function ContributionForm({
  goal,
  onChanged,
}: {
  goal: SavingsGoal;
  onChanged: () => void;
}) {
  const { supabase, user } = useAuth();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const amount = Number(new FormData(form).get("amount"));
    if (!amount) return;
    await addContribution(supabase, user.id, goal.id, goal.current_amount, amount);
    form.reset();
    onChanged();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Add contribution"
        required
        className={`${inputClass} flex-1 text-sm`}
      />
      <button type="submit" className={`${ghostButtonClass} text-xs`}>
        Add
      </button>
    </form>
  );
}

export default function GoalsPage() {
  const { supabase, user, members, canEdit, nameFor } = useAuth();
  const isShared = members.length > 1;

  const load = useCallback(async () => {
    const { data } = await supabase.from("savings_goals").select("*").order("created_at");
    return (data ?? []) as SavingsGoal[];
  }, [supabase]);

  const { data: goals, refresh } = useAsyncData(user ? load : null);

  if (!goals) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a savings goal">
        <GoalForm onChanged={refresh} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {goals.map((goal) => {
          const progress =
            goal.target_amount > 0 ? Math.min(goal.current_amount / goal.target_amount, 1) : 0;
          const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
          const months = monthsUntil(goal.target_date);
          const neededPerMonth = months && months > 0 ? remaining / months : null;

          return (
            <Card key={goal.id}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">
                  {goal.name}
                  {isShared && (
                    <span className="ml-2 text-xs font-normal text-neutral-400">
                      {nameFor(goal.user_id)}
                    </span>
                  )}
                </h3>
                {canEdit(goal.user_id) && (
                  <button
                    onClick={async () => {
                      await deleteGoal(supabase, goal.id);
                      refresh();
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    delete
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {goal.target_date &&
                  `Target: ${new Date(goal.target_date).toLocaleDateString()}`}
                {neededPerMonth !== null && ` · needs ~${formatCurrency(neededPerMonth)}/mo`}
                {goal.monthly_contribution &&
                  !neededPerMonth &&
                  ` · planned ${formatCurrency(goal.monthly_contribution)}/mo`}
              </p>
              {canEdit(goal.user_id) && <ContributionForm goal={goal} onChanged={refresh} />}
            </Card>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-neutral-500">No savings goals yet.</p>}
      </div>
    </div>
  );
}
