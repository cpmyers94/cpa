"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { addMonths, format } from "date-fns";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card, inputClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import {
  evaluate,
  simulatePayoff,
  type Strategy,
} from "@/lib/calc/debt-plan";
import type {
  Bill,
  Debt,
  DebtPayment,
  IncomeSource,
  PaycheckDeduction,
  SavingsGoal,
} from "@/lib/supabase/types";

export default function PlanPage() {
  const { supabase, user } = useAuth();
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [extraOverride, setExtraOverride] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [sources, deductions, bills, goals, debts, payments] = await Promise.all([
      supabase.from("income_sources").select("*").eq("active", true),
      supabase.from("paycheck_deductions").select("*"),
      supabase.from("bills").select("*").eq("active", true),
      supabase.from("savings_goals").select("*"),
      supabase.from("debts").select("*"),
      supabase.from("debt_payments").select("*"),
    ]);
    return {
      sources: (sources.data ?? []) as IncomeSource[],
      deductions: (deductions.data ?? []) as PaycheckDeduction[],
      bills: (bills.data ?? []) as Bill[],
      goals: (goals.data ?? []) as SavingsGoal[],
      debts: (debts.data ?? []) as Debt[],
      payments: (payments.data ?? []) as DebtPayment[],
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, goals, debts, payments } = data;
  const activeDebts = debts.filter(
    (d) => d.balance > 0 || (d.type === "bnpl" && (d.payments_remaining ?? 0) > 0)
  );

  if (activeDebts.length === 0) {
    return (
      <Card title="Get out of debt">
        <p className="text-sm text-neutral-500">
          No debts tracked — nothing to plan.{" "}
          <Link href="/debts" className="underline underline-offset-2">
            Add debts →
          </Link>{" "}
          (or enjoy being debt-free 🎉)
        </p>
      </Card>
    );
  }

  const evaluation = evaluate(sources, deductions, bills, goals, debts, payments);
  const defaultExtra = Math.max(Math.floor(evaluation.surplus), 0);
  const extra = extraOverride ?? defaultExtra;

  const plan = simulatePayoff(activeDebts, extra, strategy);
  const minimumsOnly = simulatePayoff(activeDebts, 0, "avalanche", false);
  const otherStrategy: Strategy = strategy === "avalanche" ? "snowball" : "avalanche";
  const alternative = simulatePayoff(activeDebts, extra, otherStrategy);

  const today = new Date();
  const debtFreeDate = plan.capped ? null : addMonths(today, plan.months);
  const interestSaved = minimumsOnly.capped
    ? null
    : Math.max(minimumsOnly.totalInterest - plan.totalInterest, 0);

  const findingStyles = {
    good: {
      icon: CheckCircle2,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    warn: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
    info: { icon: Info, className: "text-neutral-500" },
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <Card title="Where your money goes (monthly)">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <Stat label="Net income" value={evaluation.income} />
          <Stat label="Bills" value={evaluation.bills} negative />
          <Stat label="Savings goals" value={evaluation.goals} negative />
          <Stat label="Debt payments" value={evaluation.minimums + evaluation.bnpl} negative />
          <div>
            <p className="text-xs text-neutral-500">Left over</p>
            <p
              className={`text-lg font-semibold ${
                evaluation.surplus >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(Math.round(evaluation.surplus))}
            </p>
          </div>
        </div>
      </Card>

      {evaluation.findings.length > 0 && (
        <Card title="What the numbers say">
          <ul className="flex flex-col gap-2 text-sm">
            {evaluation.findings.map((finding, i) => {
              const { icon: Icon, className } = findingStyles[finding.kind];
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${className}`} />
                  <span className="text-neutral-700 dark:text-neutral-300">{finding.text}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Your payoff plan">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Strategy
            <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
              {(["avalanche", "snowball"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`px-3 py-2 text-sm font-medium ${
                    strategy === s
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  {s === "avalanche" ? "Avalanche" : "Snowball"}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Extra toward debt each month
            <input
              type="number"
              min="0"
              step="10"
              value={extra}
              onChange={(e) => setExtraOverride(Math.max(Number(e.target.value) || 0, 0))}
              className={`${inputClass} w-36`}
            />
          </label>
          {extraOverride !== null && extraOverride !== defaultExtra && (
            <button
              onClick={() => setExtraOverride(null)}
              className="pb-2 text-xs text-neutral-500 underline underline-offset-2"
            >
              reset to computed surplus ({formatCurrency(defaultExtra)})
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          {strategy === "avalanche"
            ? "Avalanche: highest interest rate first — the mathematically cheapest path."
            : "Snowball: smallest balance first — quicker wins, usually a little more interest."}{" "}
          BNPL plans pay out on their fixed schedules; every finished payment rolls into the next
          debt, keeping your total outlay at {formatCurrency(plan.budget)}/mo.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-neutral-500">Debt-free</p>
            <p className="text-lg font-semibold">
              {debtFreeDate
                ? `${format(debtFreeDate, "MMM yyyy")} (${plan.months} mo)`
                : "50+ years"}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Interest you&apos;ll pay</p>
            <p className="text-lg font-semibold">{formatCurrency(Math.round(plan.totalInterest))}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Saved vs. minimums only</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {interestSaved === null
                ? "everything — minimums never pay it off"
                : formatCurrency(Math.round(interestSaved))}
            </p>
          </div>
        </div>

        {!alternative.capped && !plan.capped && alternative.totalInterest !== plan.totalInterest && (
          <p className="mt-3 text-xs text-neutral-500">
            {otherStrategy === "snowball" ? "Snowball" : "Avalanche"} instead would cost{" "}
            {formatCurrency(Math.round(Math.abs(alternative.totalInterest - plan.totalInterest)))}{" "}
            {alternative.totalInterest > plan.totalInterest ? "more" : "less"} in interest
            {alternative.months !== plan.months &&
              ` and finish in ${alternative.months} months`}
            .
          </p>
        )}

        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Payoff order
          </h3>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {plan.payoffs.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between py-1">
                <span>
                  <span className="mr-2 inline-block w-5 text-right text-neutral-400">
                    {i + 1}.
                  </span>
                  {p.name}
                  {p.type === "bnpl" && (
                    <span className="ml-2 text-xs text-neutral-400">BNPL · fixed schedule</span>
                  )}
                </span>
                <span className="text-neutral-500">
                  {plan.capped ? "—" : format(addMonths(today, p.month), "MMM yyyy")}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold">
        {negative && value > 0 ? "−" : ""}
        {formatCurrency(Math.round(value))}
      </p>
    </div>
  );
}
