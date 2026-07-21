"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency, formatDate, sum } from "@/lib/calc/money";
import { nextPaycheckDate } from "@/lib/calc/schedule";
import type { IncomeSource, PaycheckDeduction } from "@/lib/supabase/types";
import { IncomeSourceForm } from "./income-source-form";
import { Deductions } from "./deductions";
import { deleteIncomeSource } from "./mutations";

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export default function PaychecksPage() {
  const { supabase, user, members, canEdit, nameFor } = useAuth();
  const isShared = members.length > 1;
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sourcesRes, deductionsRes] = await Promise.all([
      supabase.from("income_sources").select("*").order("created_at"),
      supabase.from("paycheck_deductions").select("*"),
    ]);
    return {
      sources: (sourcesRes.data ?? []) as IncomeSource[],
      deductions: (deductionsRes.data ?? []) as PaycheckDeduction[],
    };
  }, [supabase]);

  const { data, refresh } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  const { sources, deductions } = data;

  const deductionsBySource = new Map<string, PaycheckDeduction[]>();
  for (const d of deductions) {
    deductionsBySource.set(d.income_source_id, [
      ...(deductionsBySource.get(d.income_source_id) ?? []),
      d,
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add an income source">
        <IncomeSourceForm onChanged={refresh} />
      </Card>

      <div className="flex flex-col gap-4">
        {sources.map((source) => {
          const sourceDeductions = deductionsBySource.get(source.id) ?? [];
          const net = source.gross_amount - sum(sourceDeductions.map((d) => d.amount));
          const next = nextPaycheckDate(source);

          if (editingId === source.id) {
            return (
              <Card key={source.id} title={`Edit ${source.name}`}>
                <IncomeSourceForm
                  editing={source}
                  onChanged={refresh}
                  onDone={() => setEditingId(null)}
                />
              </Card>
            );
          }

          return (
            <Card key={source.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">
                    {source.name}
                    {isShared && (
                      <span className="ml-2 text-xs font-normal text-neutral-400">
                        {nameFor(source.user_id)}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {FREQUENCY_LABEL[source.frequency]}
                    {next && ` · next paycheck ${formatDate(next.toISOString().slice(0, 10))}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatCurrency(net)}</p>
                  <p className="text-xs text-neutral-500">
                    of {formatCurrency(source.gross_amount)} gross
                  </p>
                </div>
              </div>
              <Deductions
                incomeSourceId={source.id}
                deductions={sourceDeductions}
                editable={canEdit(source.user_id)}
                onChanged={refresh}
              />
              {canEdit(source.user_id) && (
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    onClick={() => setEditingId(source.id)}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      await deleteIncomeSource(supabase, source.id);
                      refresh();
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete income source
                  </button>
                </div>
              )}
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
