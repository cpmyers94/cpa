import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/supabase/user";
import { Card, inputClass, ghostButtonClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import type { SavingsGoal } from "@/lib/supabase/types";
import { GoalForm } from "./goal-form";
import { addContribution, deleteGoal } from "./actions";

function monthsUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const now = new Date();
  const target = new Date(targetDate);
  return Math.max(
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
    0
  );
}

export default async function GoalsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { supabase, user } = await requireUser();
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  const goalList = (goals ?? []) as SavingsGoal[];

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a savings goal">
        <GoalForm />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {goalList.map((goal) => {
          const progress = goal.target_amount > 0 ? Math.min(goal.current_amount / goal.target_amount, 1) : 0;
          const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
          const months = monthsUntil(goal.target_date);
          const neededPerMonth = months && months > 0 ? remaining / months : null;

          return (
            <Card key={goal.id}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{goal.name}</h3>
                <form action={deleteGoal}>
                  <input type="hidden" name="id" value={goal.id} />
                  <button className="text-xs text-red-500 hover:underline">delete</button>
                </form>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {goal.target_date && `Target: ${new Date(goal.target_date).toLocaleDateString()}`}
                {neededPerMonth !== null && ` · needs ~${formatCurrency(neededPerMonth)}/mo`}
                {goal.monthly_contribution && !neededPerMonth && ` · planned ${formatCurrency(goal.monthly_contribution)}/mo`}
              </p>
              <form action={addContribution} className="mt-3 flex gap-2">
                <input type="hidden" name="goal_id" value={goal.id} />
                <input name="amount" type="number" step="0.01" min="0.01" placeholder="Add contribution" required className={`${inputClass} flex-1 text-sm`} />
                <button type="submit" className={`${ghostButtonClass} text-xs`}>
                  Add
                </button>
              </form>
            </Card>
          );
        })}
        {goalList.length === 0 && <p className="text-sm text-neutral-500">No savings goals yet.</p>}
      </div>
    </div>
  );
}
