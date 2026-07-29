"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency, sum } from "@/lib/calc/money";
import { debtPayoff, monthlyBnplObligation } from "@/lib/calc/debt-plan";
import { marginalApr, segmentsFor } from "@/lib/debts/segments";
import type { Debt, DebtSegment } from "@/lib/supabase/types";
import { DebtForm } from "./debt-form";
import { DebtCard } from "./debt-card";

export default function DebtsPage() {
  const { supabase, user, canEdit } = useAuth();

  const load = useCallback(async () => {
    const [debtsRes, segmentsRes] = await Promise.all([
      supabase.from("debts").select("*").order("created_at"),
      supabase.from("debt_segments").select("*"),
    ]);
    return {
      debts: (debtsRes.data ?? []) as Debt[],
      segments: (segmentsRes.data ?? []) as DebtSegment[],
    };
  }, [supabase]);

  const { data, refresh } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  const { debts, segments } = data;

  const totalBalance = sum(debts.map((d) => debtPayoff(d, segments)));
  const totalMinimum =
    sum(debts.map((d) => d.minimum_payment)) + monthlyBnplObligation(debts);
  // BNPL plans run on fixed schedules, so they don't participate in
  // avalanche ordering. A split card ranks by its costliest bucket, since
  // that's where an extra dollar lands.
  const avalancheOrder = debts
    .filter((d) => d.type !== "bnpl")
    .sort((a, b) => marginalApr(b, segments) - marginalApr(a, segments));

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a debt">
        <DebtForm onChanged={refresh} />
      </Card>

      {debts.length > 0 && (
        <Card title="Overview">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-neutral-500">Total balance</p>
              <p className="text-lg font-semibold">{formatCurrency(totalBalance)}</p>
            </div>
            <div>
              <p className="text-neutral-500">Committed payments /mo</p>
              <p className="text-lg font-semibold">{formatCurrency(totalMinimum)}</p>
            </div>
          </div>
          {avalancheOrder.length > 0 && (
            <p className="mt-4 text-xs text-neutral-500">
              Avalanche payoff order (highest interest rate first):{" "}
              {avalancheOrder.map((d) => d.name).join(" → ")}
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {debts.map((debt) => (
          <DebtCard
            key={debt.id}
            debt={debt}
            segments={segmentsFor(debt.id, segments)}
            editable={canEdit(debt.user_id)}
            onChanged={refresh}
          />
        ))}
        {debts.length === 0 && <p className="text-sm text-neutral-500">No debts tracked yet.</p>}
      </div>
    </div>
  );
}
