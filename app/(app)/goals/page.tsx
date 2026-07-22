"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card, inputClass, ghostButtonClass } from "@/components/card";
import { formatCurrency, formatDate } from "@/lib/calc/money";
import type { SavingsGoal } from "@/lib/supabase/types";
import { GoalForm } from "./goal-form";
import { addContribution, deleteGoal } from "./mutations";

function monthsUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const now = new Date();
  // Parse as local calendar parts so the month isn't pulled back a day (and
  // sometimes a whole month) by UTC parsing in negative-offset timezones.
  const [y, m] = targetDate.split("-").map(Number);
  return Math.max((y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()), 0);
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
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("savings_goals").select("*").order("created_at");
    return (data ?? []) as SavingsGoal[];
  }, [supabase]);

  const { data: goals, refresh } = useAsyncData(user ? load : null);

  if (!goals) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const totalSaved = goals.reduce((acc, g) => acc + g.current_amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Total in savings">
        <p className="text-3xl font-semibold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(totalSaved)}
        </p>
        <p className="text-xs text-neutral-500">
          across {goals.length} savings {goals.length === 1 ? "bucket" : "buckets"} — your cash
          cushion plus everything set aside toward goals.
        </p>
      </Card>

      <Card title="Add savings or a goal">
        <GoalForm onChanged={refresh} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {goals.map((goal) => {
          if (editingId === goal.id) {
            return (
              <Card key={goal.id} title={`Edit ${goal.name}`}>
                <GoalForm editing={goal} onChanged={refresh} onDone={() => setEditingId(null)} />
              </Card>
            );
          }
          const isPool = goal.target_amount == null;
          const target = goal.target_amount ?? 0;
          const progress = target > 0 ? Math.min(goal.current_amount / target, 1) : 0;
          const remaining = Math.max(target - goal.current_amount, 0);
          const funded = !isPool && target > 0 && goal.current_amount >= target - 0.005;
          const months = monthsUntil(goal.target_date);
          const neededPerMonth = !isPool && months && months > 0 ? remaining / months : null;

          return (
            <Card key={goal.id}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">
                  {goal.name}
                  {funded && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      Fully funded 🎉
                    </span>
                  )}
                  {isShared && (
                    <span className="ml-2 text-xs font-normal text-neutral-400">
                      {nameFor(goal.user_id)}
                    </span>
                  )}
                </h3>
                {canEdit(goal.user_id) && (
                  <span className="flex gap-3">
                    <button
                      onClick={() => setEditingId(goal.id)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      edit
                    </button>
                    <button
                      onClick={async () => {
                        await deleteGoal(supabase, goal.id);
                        refresh();
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      delete
                    </button>
                  </span>
                )}
              </div>
              {isPool ? (
                <>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCurrency(goal.current_amount)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    saved
                    {goal.per_paycheck_contribution
                      ? ` · adding ${formatCurrency(goal.per_paycheck_contribution)}/paycheck`
                      : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-neutral-500">
                    {formatCurrency(goal.current_amount)} of {formatCurrency(target)}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div className="h-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    {funded ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Done — {goal.per_paycheck_contribution
                          ? `${formatCurrency(goal.per_paycheck_contribution)}/paycheck freed back to spending`
                          : "no more contributions needed"}
                      </span>
                    ) : (
                      <>
                        {goal.target_date && `Target: ${formatDate(goal.target_date)}`}
                        {neededPerMonth !== null && ` · needs ~${formatCurrency(neededPerMonth)}/mo`}
                        {goal.per_paycheck_contribution &&
                          ` · ${formatCurrency(goal.per_paycheck_contribution)}/paycheck`}
                      </>
                    )}
                  </p>
                </>
              )}
              {canEdit(goal.user_id) && <ContributionForm goal={goal} onChanged={refresh} />}
            </Card>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-neutral-500">No savings goals yet.</p>}
      </div>
    </div>
  );
}
