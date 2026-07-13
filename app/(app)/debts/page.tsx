import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/supabase/user";
import { Card } from "@/components/card";
import { formatCurrency, sum } from "@/lib/calc/money";
import type { Debt } from "@/lib/supabase/types";
import { DebtForm } from "./debt-form";
import { DebtCard } from "./debt-card";

export default async function DebtsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { supabase, user } = await requireUser();
  const { data: debts } = await supabase.from("debts").select("*").eq("user_id", user.id).order("created_at");

  const debtList = (debts ?? []) as Debt[];
  const totalBalance = sum(debtList.map((d) => d.balance));
  const totalMinimum = sum(debtList.map((d) => d.minimum_payment));
  const avalancheOrder = [...debtList].sort((a, b) => b.interest_rate - a.interest_rate);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a debt">
        <DebtForm />
      </Card>

      {debtList.length > 0 && (
        <Card title="Overview">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-neutral-500">Total balance</p>
              <p className="text-lg font-semibold">{formatCurrency(totalBalance)}</p>
            </div>
            <div>
              <p className="text-neutral-500">Total minimum payments</p>
              <p className="text-lg font-semibold">{formatCurrency(totalMinimum)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Avalanche payoff order (highest interest rate first): {avalancheOrder.map((d) => d.name).join(" → ")}
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {debtList.map((debt) => (
          <DebtCard key={debt.id} debt={debt} />
        ))}
        {debtList.length === 0 && <p className="text-sm text-neutral-500">No debts tracked yet.</p>}
      </div>
    </div>
  );
}
