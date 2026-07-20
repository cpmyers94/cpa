"use client";

import { useCallback } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency, sum } from "@/lib/calc/money";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import { getObligations } from "@/lib/calc/obligations";
import type {
  Bill,
  Debt,
  Expense,
  IncomeSource,
  ObligationAllocation,
  ObligationType,
  PaycheckDeduction,
  SavingsGoal,
} from "@/lib/supabase/types";

const WINDOW_DAYS = 30;

type DashboardData = {
  sources: IncomeSource[];
  deductions: PaycheckDeduction[];
  bills: Bill[];
  expenses: Expense[];
  allocations: ObligationAllocation[];
  goals: SavingsGoal[];
  debts: Debt[];
};

function allocationColumn(type: ObligationType): "bill_id" | "debt_id" | "expense_id" {
  return type === "bill" ? "bill_id" : type === "debt" ? "debt_id" : "expense_id";
}

export default function DashboardPage() {
  const { supabase, user } = useAuth();

  const load = useCallback(async (): Promise<DashboardData> => {
    const [sources, deductions, bills, expenses, allocations, goals, debts] = await Promise.all([
      supabase.from("income_sources").select("*").eq("active", true),
      supabase.from("paycheck_deductions").select("*"),
      supabase.from("bills").select("*").eq("active", true),
      supabase.from("expenses").select("*").eq("active", true),
      supabase.from("bill_allocations").select("*"),
      supabase.from("savings_goals").select("*"),
      supabase.from("debts").select("*"),
    ]);
    return {
      sources: (sources.data ?? []) as IncomeSource[],
      deductions: (deductions.data ?? []) as PaycheckDeduction[],
      bills: (bills.data ?? []) as Bill[],
      expenses: (expenses.data ?? []) as Expense[],
      allocations: (allocations.data ?? []) as ObligationAllocation[],
      goals: (goals.data ?? []) as SavingsGoal[],
      debts: (debts.data ?? []) as Debt[],
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, expenses, allocations, goals, debts } = data;

  const today = new Date();
  const rangeEnd = addDays(today, WINDOW_DAYS);

  const upcomingPaychecks = sources
    .flatMap((source) => {
      const netDeductions = sum(
        deductions.filter((d) => d.income_source_id === source.id).map((d) => d.amount)
      );
      return getPaycheckOccurrences(source, today, rangeEnd).map((date) => ({
        source,
        date,
        net: source.gross_amount - netDeductions,
      }));
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const upcomingObligations = getObligations(bills, debts, expenses, today, rangeEnd);

  const totalIncoming = sum(upcomingPaychecks.map((p) => p.net));
  const totalOutgoing = sum(upcomingObligations.map((o) => o.amount));
  const unallocatedCount = upcomingObligations.filter(
    (ob) =>
      !allocations.some(
        (a) => a[allocationColumn(ob.type)] === ob.id && a.bill_due_date === ob.date
      )
  ).length;

  const totalDebt = sum(debts.map((d) => d.balance));
  const totalSaved = sum(goals.map((g) => g.current_amount));
  const goalTarget = sum(goals.map((g) => g.target_amount ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title={`Next ${WINDOW_DAYS} days`}>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalIncoming)}
          </p>
          <p className="text-xs text-neutral-500">
            incoming from {upcomingPaychecks.length} paycheck(s)
          </p>
          <p className="mt-3 text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {formatCurrency(totalOutgoing)}
          </p>
          <p className="text-xs text-neutral-500">bills, debts &amp; subscriptions due</p>
        </Card>
        <Card title="Debt">
          <p className="text-2xl font-semibold">{formatCurrency(totalDebt)}</p>
          <p className="text-xs text-neutral-500">total balance across {debts.length} debt(s)</p>
          <Link
            href="/debts"
            className="mt-3 inline-block text-xs text-neutral-500 underline underline-offset-2"
          >
            View payoff plans →
          </Link>
        </Card>
        <Card title="Savings">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalSaved)}
          </p>
          <p className="text-xs text-neutral-500">
            your cash cushion{goalTarget > 0 && ` · ${formatCurrency(goalTarget)} in goal targets`}
          </p>
          <Link
            href="/goals"
            className="mt-3 inline-block text-xs text-neutral-500 underline underline-offset-2"
          >
            Manage savings →
          </Link>
        </Card>
      </div>

      {unallocatedCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
          {unallocatedCount} upcoming obligation{unallocatedCount === 1 ? "" : "s"} not yet assigned
          to a paycheck.{" "}
          <Link href="/bills" className="underline underline-offset-2">
            Assign them →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Upcoming paychecks">
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {upcomingPaychecks.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>
                  {p.source.name} · {p.date.toLocaleDateString()}
                </span>
                <span className="font-medium">{formatCurrency(p.net)}</span>
              </li>
            ))}
            {upcomingPaychecks.length === 0 && (
              <li className="py-2 text-neutral-500">
                No income sources yet.{" "}
                <Link href="/paychecks" className="underline underline-offset-2">
                  Add one →
                </Link>
              </li>
            )}
          </ul>
        </Card>
        <Card title="Upcoming obligations">
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {upcomingObligations.map((ob, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>
                  {ob.name} · {new Date(ob.date).toLocaleDateString()}
                </span>
                <span className="font-medium">{formatCurrency(ob.amount)}</span>
              </li>
            ))}
            {upcomingObligations.length === 0 && (
              <li className="py-2 text-neutral-500">
                Nothing due yet.{" "}
                <Link href="/bills" className="underline underline-offset-2">
                  Add a bill →
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
