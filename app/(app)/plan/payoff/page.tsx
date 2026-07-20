"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { addMonths, format } from "date-fns";
import { ArrowLeft, Flag, PartyPopper } from "lucide-react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import {
  evaluate,
  paychecksPerMonth,
  recommendSnowball,
  simulatePayoff,
  type Strategy,
} from "@/lib/calc/debt-plan";
import type {
  Bill,
  Debt,
  DebtPayment,
  Expense,
  IncomeSource,
  PaycheckDeduction,
  PlanSettings,
  SavingsGoal,
} from "@/lib/supabase/types";

export default function PayoffDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-400">Loading…</p>}>
      <PayoffDetail />
    </Suspense>
  );
}

function PayoffDetail() {
  const { supabase, user } = useAuth();
  const params = useSearchParams();
  const strategyParam = params.get("strategy");
  const extraParam = params.get("extra");

  const load = useCallback(async () => {
    const [sources, deductions, bills, expenses, goals, debts, payments, settings] =
      await Promise.all([
        supabase.from("income_sources").select("*").eq("active", true),
        supabase.from("paycheck_deductions").select("*"),
        supabase.from("bills").select("*").eq("active", true),
        supabase.from("expenses").select("*").eq("active", true),
        supabase.from("savings_goals").select("*"),
        supabase.from("debts").select("*"),
        supabase.from("debt_payments").select("*"),
        supabase.from("plan_settings").select("*").limit(1),
      ]);
    return {
      sources: (sources.data ?? []) as IncomeSource[],
      deductions: (deductions.data ?? []) as PaycheckDeduction[],
      bills: (bills.data ?? []) as Bill[],
      expenses: (expenses.data ?? []) as Expense[],
      goals: (goals.data ?? []) as SavingsGoal[],
      debts: (debts.data ?? []) as Debt[],
      payments: (payments.data ?? []) as DebtPayment[],
      settings: ((settings.data ?? [])[0] as PlanSettings | undefined) ?? null,
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, expenses, goals, debts, payments, settings } = data;
  const activeDebts = debts.filter(
    (d) => d.balance > 0 || (d.type === "bnpl" && (d.payments_remaining ?? 0) > 0)
  );

  if (activeDebts.length === 0) {
    return (
      <Card title="Step-by-step payoff">
        <p className="text-sm text-neutral-500">
          No debts tracked — nothing to plan.{" "}
          <Link href="/debts" className="underline underline-offset-2">
            Add debts →
          </Link>
        </p>
      </Card>
    );
  }

  const evaluation = evaluate(sources, deductions, bills, expenses, goals, debts, payments);
  const recommendation = recommendSnowball(evaluation);
  const strategy: Strategy =
    strategyParam === "snowball" || strategyParam === "avalanche"
      ? strategyParam
      : (settings?.strategy ?? "snowball");
  const extra =
    extraParam !== null
      ? Math.max(Number(extraParam) || 0, 0)
      : (settings?.extra_override ?? recommendation.recommended);

  const plan = simulatePayoff(activeDebts, extra, strategy);
  const today = new Date();
  const ppm = paychecksPerMonth(sources);
  const perPaycheck = (monthly: number) =>
    ppm > 0 ? ` (≈ ${formatCurrency(Math.round(monthly / ppm))}/paycheck)` : "";

  const balanceToday = (id: string) => {
    const d = activeDebts.find((x) => x.id === id);
    if (!d) return 0;
    return d.type === "bnpl" ? (d.payments_remaining ?? 0) * (d.installment_amount ?? 0) : d.balance;
  };

  const firstTarget = plan.payoffs[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/plan"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
        >
          <ArrowLeft size={14} /> Back to plan
        </Link>
      </div>

      <Card title="Step-by-step payoff">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-neutral-500">Strategy</p>
            <p className="text-lg font-semibold capitalize">{strategy}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Starting snowball</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(extra)}/mo
            </p>
            {ppm > 0 && (
              <p className="text-xs text-neutral-500">
                ≈ {formatCurrency(Math.round(extra / ppm))} per paycheck
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-neutral-500">Total outlay</p>
            <p className="text-lg font-semibold">{formatCurrency(plan.budget)}/mo</p>
            <p className="text-xs text-neutral-500">never more than today</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Debt-free</p>
            <p className="text-lg font-semibold">
              {plan.capped ? "50+ years" : `${format(addMonths(today, plan.months), "MMM yyyy")}`}
            </p>
          </div>
        </div>
      </Card>

      <Card title="How your snowball grows">
        <ol className="relative flex flex-col gap-0 border-l border-neutral-200 pl-6 dark:border-neutral-800">
          <li className="relative pb-6">
            <span className="absolute -left-[1.85rem] mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              <Flag size={12} />
            </span>
            <p className="text-sm font-semibold">
              Today — snowball starts at {formatCurrency(extra)}/mo{perPaycheck(extra)}
            </p>
            <p className="text-xs text-neutral-500">
              Minimums and installments all get paid; the snowball attacks{" "}
              <strong>{firstTarget?.name}</strong> first
              {strategy === "snowball" ? " (smallest balance)" : " (highest interest rate)"}.
            </p>
          </li>

          {plan.payoffs.map((p, i) => (
            <li key={p.id} className="relative pb-6">
              <span className="absolute -left-[1.85rem] mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-sm font-semibold">
                {plan.capped ? "—" : format(addMonths(today, p.month), "MMM yyyy")} · {p.name} paid
                off
                {p.type === "bnpl" && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">BNPL</span>
                )}
              </p>
              <p className="text-xs text-neutral-500">
                {p.freed > 0 ? (
                  <>
                    Frees {formatCurrency(p.freed)}/mo — snowball grows to{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(p.snowballAfter)}/mo
                    </strong>
                    {perPaycheck(p.snowballAfter)}
                    {i < plan.payoffs.length - 1 && (
                      <> and rolls onto {plan.payoffs[i + 1].name}</>
                    )}
                  </>
                ) : (
                  <>No monthly payment attached — one less balance to think about.</>
                )}
              </p>
            </li>
          ))}

          <li className="relative">
            <span className="absolute -left-[1.85rem] mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
              <PartyPopper size={12} />
            </span>
            <p className="text-sm font-semibold">
              {plan.capped ? "Someday" : format(addMonths(today, plan.months), "MMM yyyy")} —
              debt-free 🎉
            </p>
            <p className="text-xs text-neutral-500">
              The whole {formatCurrency(plan.budget)}/mo{perPaycheck(plan.budget)} becomes yours
              again — savings, goals, life.
            </p>
          </li>
        </ol>
      </Card>

      <Card title="Every debt, in order">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Debt</th>
                <th className="py-2 pr-3 text-right font-medium">Balance today</th>
                <th className="py-2 pr-3 text-right font-medium">Payment/mo</th>
                <th className="py-2 pr-3 text-right font-medium">Paid off</th>
                <th className="py-2 text-right font-medium">Snowball after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {plan.payoffs.map((p, i) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 text-neutral-400">{i + 1}</td>
                  <td className="py-2 pr-3">
                    {p.name}
                    {p.type === "bnpl" && (
                      <span className="ml-2 text-xs text-neutral-400">BNPL</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">{formatCurrency(balanceToday(p.id))}</td>
                  <td className="py-2 pr-3 text-right">
                    {p.freed > 0 ? formatCurrency(p.freed) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {plan.capped ? "—" : format(addMonths(today, p.month), "MMM yyyy")}
                  </td>
                  <td className="py-2 text-right text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(p.snowballAfter)}/mo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Payments here are what the plan assumes each month (minimums and BNPL installments).
          Interest over the whole plan: {formatCurrency(Math.round(plan.totalInterest))}.
        </p>
      </Card>
    </div>
  );
}
