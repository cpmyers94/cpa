"use client";

import { useCallback } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency, sum } from "@/lib/calc/money";
import { getObligations, monthlyBudgetExpenses } from "@/lib/calc/obligations";
import { monthlyBnplObligation } from "@/lib/calc/debt-plan";
import { buildPaycheckPlan } from "@/lib/calc/paycheck-plan";
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
import { Affordability } from "./affordability";

const TYPE_DOT: Record<ObligationType, string> = {
  bill: "bg-amber-400",
  debt: "bg-rose-400",
  expense: "bg-indigo-400",
};

export default function SafeToSpendPage() {
  const { supabase, user } = useAuth();

  const load = useCallback(async () => {
    const [sources, deductions, bills, debts, expenses, goals, allocations] = await Promise.all([
      supabase.from("income_sources").select("*").eq("active", true),
      supabase.from("paycheck_deductions").select("*"),
      supabase.from("bills").select("*").eq("active", true),
      supabase.from("debts").select("*"),
      supabase.from("expenses").select("*").eq("active", true),
      supabase.from("savings_goals").select("*"),
      supabase.from("bill_allocations").select("*"),
    ]);
    return {
      sources: (sources.data ?? []) as IncomeSource[],
      deductions: (deductions.data ?? []) as PaycheckDeduction[],
      bills: (bills.data ?? []) as Bill[],
      debts: (debts.data ?? []) as Debt[],
      expenses: (expenses.data ?? []) as Expense[],
      goals: (goals.data ?? []) as SavingsGoal[],
      allocations: (allocations.data ?? []) as ObligationAllocation[],
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, debts, expenses, goals, allocations } = data;

  const today = new Date();
  // Wide window so allocated obligation occurrences can be looked up by date.
  const obligations = getObligations(bills, debts, expenses, addDays(today, -7), addDays(today, 120));

  const monthlyBudget = monthlyBudgetExpenses(expenses);

  const savings = goals
    .filter((g) => (g.per_paycheck_contribution ?? 0) > 0)
    .map((g) => ({ name: g.name, amount: g.per_paycheck_contribution as number }));

  const plan = buildPaycheckPlan(
    sources,
    deductions,
    obligations,
    allocations,
    monthlyBudget,
    savings,
    today,
    addDays(today, 60),
    6
  );

  // Monthly money already headed to debt (minimums + BNPL). Extra surplus isn't
  // included here — this is the conservative "what's committed to debt" pace.
  const monthlyDebtOutlay =
    sum(debts.filter((d) => d.type !== "bnpl" && d.balance > 0).map((d) => d.minimum_payment)) +
    monthlyBnplObligation(debts);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Can I afford it?">
        <p className="mb-4 text-xs text-neutral-500">
          Check a purchase against a specific paycheck — before you spend it.
        </p>
        <Affordability entries={plan} monthlyDebtOutlay={monthlyDebtOutlay} />
      </Card>

      <Card title="Safe to spend, paycheck by paycheck">
        <p className="mb-4 text-xs text-neutral-500">
          Each paycheck&apos;s take-home minus the obligations you&apos;ve assigned to it, its
          per-paycheck savings set-asides, and its share of your everyday budget. What&apos;s left
          is genuinely free.
        </p>

        {plan.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No upcoming paychecks.{" "}
            <Link href="/paychecks" className="underline underline-offset-2">
              Add an income source →
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {plan.map((entry) => (
              <div
                key={`${entry.incomeSourceId}-${entry.date}`}
                className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {new Date(entry.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {entry.incomeSourceName} · {formatCurrency(entry.net)} take-home
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xl font-bold ${
                        entry.freeToSpend >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(entry.freeToSpend)}
                    </p>
                    <p className="text-xs text-neutral-500">free to spend</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
                  {entry.assigned.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${TYPE_DOT[a.type]}`} />
                        {a.name}
                      </span>
                      <span>−{formatCurrency(a.amount)}</span>
                    </div>
                  ))}
                  {entry.savings.map((s, i) => (
                    <div key={`s${i}`} className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        {s.name} <span className="text-neutral-400">(savings)</span>
                      </span>
                      <span>−{formatCurrency(s.amount)}</span>
                    </div>
                  ))}
                  {entry.budgetReserve > 0 && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-neutral-400" />
                        Everyday budget set-aside
                      </span>
                      <span>−{formatCurrency(entry.budgetReserve)}</span>
                    </div>
                  )}
                  {entry.assigned.length === 0 &&
                    entry.savings.length === 0 &&
                    entry.budgetReserve === 0 && (
                      <p className="text-neutral-400">Nothing assigned to this paycheck yet.</p>
                    )}
                </div>
              </div>
            ))}
            <p className="text-xs text-neutral-500">
              Only obligations you&apos;ve assigned are subtracted. Assign upcoming ones on the{" "}
              <Link href="/bills" className="underline underline-offset-2">
                Bills page
              </Link>{" "}
              (or use auto-assign) so this number stays honest.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
