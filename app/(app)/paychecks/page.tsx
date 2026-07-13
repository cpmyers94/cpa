import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/supabase/user";
import { Card } from "@/components/card";
import { formatCurrency, sum } from "@/lib/calc/money";
import { nextPaycheckDate } from "@/lib/calc/schedule";
import type { IncomeSource, PaycheckDeduction } from "@/lib/supabase/types";
import { IncomeSourceForm } from "./income-source-form";
import { Deductions } from "./deductions";
import { deleteIncomeSource } from "./actions";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export default async function PaychecksPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { supabase, user } = await requireUser();

  const [{ data: incomeSources }, { data: deductions }] = await Promise.all([
    supabase.from("income_sources").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("paycheck_deductions").select("*").eq("user_id", user.id),
  ]);

  const sources = (incomeSources ?? []) as IncomeSource[];
  const deductionsBySource = new Map<string, PaycheckDeduction[]>();
  for (const d of (deductions ?? []) as PaycheckDeduction[]) {
    deductionsBySource.set(d.income_source_id, [...(deductionsBySource.get(d.income_source_id) ?? []), d]);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add an income source">
        <IncomeSourceForm />
      </Card>

      <div className="flex flex-col gap-4">
        {sources.map((source) => {
          const sourceDeductions = deductionsBySource.get(source.id) ?? [];
          const net = source.gross_amount - sum(sourceDeductions.map((d) => d.amount));
          const next = nextPaycheckDate(source);

          return (
            <Card key={source.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{source.name}</h3>
                  <p className="text-xs text-neutral-500">
                    {FREQUENCY_LABEL[source.frequency]}
                    {next && ` · next paycheck ${next.toLocaleDateString()}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatCurrency(net)}</p>
                  <p className="text-xs text-neutral-500">of {formatCurrency(source.gross_amount)} gross</p>
                </div>
              </div>
              <Deductions incomeSourceId={source.id} deductions={sourceDeductions} />
              <form action={deleteIncomeSource} className="mt-3 text-right">
                <input type="hidden" name="id" value={source.id} />
                <button className="text-xs text-red-500 hover:underline">Delete income source</button>
              </form>
            </Card>
          );
        })}
        {sources.length === 0 && (
          <p className="text-sm text-neutral-500">No income sources yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
