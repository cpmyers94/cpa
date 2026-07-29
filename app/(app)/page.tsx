"use client";

import { useCallback } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency, formatDate, sum } from "@/lib/calc/money";
import { getObligations, monthlyBudgetExpenses } from "@/lib/calc/obligations";
import { debtPayoff } from "@/lib/calc/debt-plan";
import { buildPaycheckPlan, type AssignedSnowballPayment } from "@/lib/calc/paycheck-plan";
import type {
  Bill,
  Debt,
  Expense,
  IncomeSource,
  ObligationAllocation,
  ObligationType,
  PaycheckDeduction,
  SnowballPayment,
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
  payments: SnowballPayment[];
};

function allocationColumn(type: ObligationType): "bill_id" | "debt_id" | "expense_id" {
  return type === "bill" ? "bill_id" : type === "debt" ? "debt_id" : "expense_id";
}

export default function DashboardPage() {
  const { supabase, user } = useAuth();

  const load = useCallback(async (): Promise<DashboardData> => {
    const [sources, deductions, bills, expenses, allocations, goals, debts, payments] =
      await Promise.all([
        supabase.from("income_sources").select("*").eq("active", true),
        supabase.from("paycheck_deductions").select("*"),
        supabase.from("bills").select("*").eq("active", true),
        supabase.from("expenses").select("*").eq("active", true),
        supabase.from("bill_allocations").select("*"),
        supabase.from("savings_goals").select("*"),
        supabase.from("debts").select("*"),
        supabase.from("snowball_payments").select("*"),
      ]);
    return {
      sources: (sources.data ?? []) as IncomeSource[],
      deductions: (deductions.data ?? []) as PaycheckDeduction[],
      bills: (bills.data ?? []) as Bill[],
      expenses: (expenses.data ?? []) as Expense[],
      allocations: (allocations.data ?? []) as ObligationAllocation[],
      goals: (goals.data ?? []) as SavingsGoal[],
      debts: (debts.data ?? []) as Debt[],
      payments: (payments.data ?? []) as SnowballPayment[],
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, expenses, allocations, goals, debts, payments } = data;

  const today = new Date();
  const rangeEnd = addDays(today, WINDOW_DAYS);

  // Per-paycheck plan (net + free-to-spend), same inputs as the Safe to Spend
  // page so the numbers match. Wide obligation window so allocations resolve.
  const monthlyBudget = monthlyBudgetExpenses(expenses);
  const savings = goals
    .filter((g) => (g.per_paycheck_contribution ?? 0) > 0)
    .map((g) => ({
      name: g.name,
      perPaycheck: g.per_paycheck_contribution as number,
      currentAmount: g.current_amount,
      targetAmount: g.target_amount,
    }));
  // Only extra payments actually assigned to a paycheck reduce its free-to-spend.
  const assignedSnowball: AssignedSnowballPayment[] = payments.map((p) => ({
    id: p.id,
    incomeSourceId: p.income_source_id,
    paycheckDate: p.paycheck_date,
    targetName: debts.find((d) => d.id === p.debt_id)?.name.trim() ?? "debt",
    amount: p.amount,
  }));
  const planObligations = getObligations(
    bills,
    debts,
    expenses,
    addDays(today, -7),
    addDays(today, WINDOW_DAYS + 30)
  );
  const upcomingPaychecks = buildPaycheckPlan(
    sources,
    deductions,
    planObligations,
    allocations,
    monthlyBudget,
    savings,
    today,
    rangeEnd,
    100,
    assignedSnowball
  );

  const upcomingObligations = getObligations(bills, debts, expenses, today, rangeEnd);

  const totalIncoming = sum(upcomingPaychecks.map((p) => p.net));
  const totalOutgoing = sum(upcomingObligations.map((o) => o.amount));
  const unallocatedCount = upcomingObligations.filter(
    (ob) =>
      !allocations.some(
        (a) => a[allocationColumn(ob.type)] === ob.id && a.bill_due_date === ob.date
      )
  ).length;

  const totalDebt = sum(debts.map(debtPayoff));
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
                  {p.incomeSourceName} · {formatDate(p.date)}
                </span>
                <span className="text-right">
                  <span className="block font-medium">{formatCurrency(p.net)}</span>
                  <span
                    className={`block text-xs ${
                      p.freeToSpend >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatCurrency(p.freeToSpend)} free
                  </span>
                </span>
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
                  {ob.name} · {formatDate(ob.date)}
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
