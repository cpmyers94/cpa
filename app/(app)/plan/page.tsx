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
  paychecksPerMonth,
  recommendSnowball,
  simulatePayoff,
  type Strategy,
} from "@/lib/calc/debt-plan";
import { toScheduledExtras } from "@/lib/debts/assignments";
import { DEFAULT_UTILIZATION_TARGET } from "@/lib/debts/utilization";
import type {
  Bill,
  Debt,
  DebtSegment,
  DebtPayment,
  Expense,
  IncomeSource,
  PaycheckDeduction,
  PlanSettings,
  SavingsGoal,
  SnowballPayment,
} from "@/lib/supabase/types";

export default function PlanPage() {
  const { supabase, user, household } = useAuth();
  const [strategyLocal, setStrategyLocal] = useState<Strategy | null>(null);
  const [extraLocal, setExtraLocal] = useState<number | null>(null);
  const [extraTouched, setExtraTouched] = useState(false);

  const load = useCallback(async () => {
    const [
      sources,
      deductions,
      bills,
      expenses,
      goals,
      debts,
      payments,
      settings,
      extras,
      segments,
    ] = await Promise.all([
        supabase.from("income_sources").select("*").eq("active", true),
        supabase.from("paycheck_deductions").select("*"),
        supabase.from("bills").select("*").eq("active", true),
        supabase.from("expenses").select("*").eq("active", true),
        supabase.from("savings_goals").select("*"),
        supabase.from("debts").select("*"),
        supabase.from("debt_payments").select("*"),
        supabase.from("plan_settings").select("*").limit(1),
        supabase.from("snowball_payments").select("*"),
        supabase.from("debt_segments").select("*"),
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
      extras: (extras.data ?? []) as SnowballPayment[],
      segments: (segments.data ?? []) as DebtSegment[],
    };
  }, [supabase]);

  const { data } = useAsyncData(user ? load : null);

  async function saveSettings(patch: Partial<Pick<PlanSettings, "strategy" | "extra_override">>) {
    if (!user || !household) return;
    await supabase.from("plan_settings").upsert(
      {
        household_id: household.id,
        user_id: user.id,
        strategy: strategyLocal ?? data?.settings?.strategy ?? "snowball",
        extra_override: extraTouched ? extraLocal : (data?.settings?.extra_override ?? null),
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: "household_id" }
    );
  }

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const { sources, deductions, bills, expenses, goals, debts, payments, extras, segments } =
    data;
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

  const evaluation = evaluate(sources, deductions, bills, expenses, goals, debts, payments, segments);
  const recommendation = recommendSnowball(evaluation);
  const defaultExtra = recommendation.recommended;
  const strategy: Strategy = strategyLocal ?? data.settings?.strategy ?? "snowball";
  const utilizationTarget = data.settings?.utilization_target ?? DEFAULT_UTILIZATION_TARGET;
  const savedOverride = extraTouched ? extraLocal : (data.settings?.extra_override ?? null);
  const extra = savedOverride ?? defaultExtra;
  const perPaycheckDivisor = paychecksPerMonth(sources);
  const extraPerPaycheck = perPaycheckDivisor > 0 ? extra / perPaycheckDivisor : null;

  const today = new Date();

  // Extra payments already assigned to a paycheck are honoured on the month
  // they land in, so this projection agrees with Safe to Spend instead of
  // assuming the budget flows wherever the strategy would have sent it.
  const scheduled = toScheduledExtras(extras, today);

  const plan = simulatePayoff(
    activeDebts,
    extra,
    strategy,
    true,
    scheduled,
    segments,
    today,
    utilizationTarget
  );
  const minimumsOnly = simulatePayoff(activeDebts, 0, "avalanche", false, [], segments, today);
  const otherStrategy: Strategy = strategy === "avalanche" ? "snowball" : "avalanche";
  const alternative = simulatePayoff(
    activeDebts,
    extra,
    otherStrategy,
    true,
    scheduled,
    segments,
    today
  );

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
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-6">
          <Stat label="Net income" value={evaluation.income} />
          <Stat label="Bills" value={evaluation.bills} negative />
          <Stat label="Expenses" value={evaluation.expenses} negative />
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

      <Card title="Your starting snowball">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          A safe, comfortable amount to throw at debt beyond the minimums — computed from your real
          budget, not a guess:
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Stat label="Monthly surplus" value={recommendation.surplus} />
          <Stat label="Cushion held back" value={recommendation.buffer} negative />
          <div>
            <p className="text-xs text-neutral-500">Safe snowball</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(recommendation.recommended)}/mo
            </p>
            {perPaycheckDivisor > 0 && (
              <p className="text-xs text-neutral-500">
                ≈ {formatCurrency(Math.round(recommendation.recommended / perPaycheckDivisor))} per
                paycheck
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          The cushion (10% of income, at least $100) stays in your pocket for surprises so one flat
          tire doesn&apos;t sink the plan. As each debt clears, its payment joins the snowball
          automatically — you never pay more per month than you do today.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          This is a monthly budget, not a per-paycheck deduction.{" "}
          <Link href="/safe-to-spend" className="underline underline-offset-2">
            Safe to Spend
          </Link>{" "}
          picks the paycheck each month with the most room to absorb it — so a heavy paycheck
          already carrying rent and loan payments is left alone — and nothing comes out of
          free-to-spend until you assign it.
        </p>
      </Card>

      <Card title="Your payoff plan">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Strategy
            <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
              {(["avalanche", "snowball", "utilization"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStrategyLocal(s);
                    void saveSettings({ strategy: s });
                  }}
                  className={`px-3 py-2 text-sm font-medium ${
                    strategy === s
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  {s === "avalanche"
                    ? "Avalanche"
                    : s === "snowball"
                      ? "Snowball"
                      : `${utilizationTarget}% mode`}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Snowball (extra/mo)
            <input
              type="number"
              min="0"
              step="10"
              value={extra}
              onChange={(e) => {
                setExtraTouched(true);
                setExtraLocal(Math.max(Number(e.target.value) || 0, 0));
              }}
              onBlur={(e) =>
                void saveSettings({
                  extra_override: Math.max(Number(e.target.value) || 0, 0),
                })
              }
              className={`${inputClass} w-36`}
            />
          </label>
          {savedOverride !== null && savedOverride !== defaultExtra && (
            <button
              onClick={() => {
                setExtraTouched(true);
                setExtraLocal(null);
                void saveSettings({ extra_override: null });
              }}
              className="pb-2 text-xs text-neutral-500 underline underline-offset-2"
            >
              reset to safe snowball ({formatCurrency(defaultExtra)})
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          {strategy === "avalanche"
            ? "Avalanche: highest interest rate first — the mathematically cheapest path. 0% BNPL plans wait their turn while high-interest debt burns."
            : strategy === "snowball"
              ? "Snowball: smallest balance first — including BNPL plans, which you can pay off early to free their installment sooner."
              : `${utilizationTarget}% mode: get every card back under ${utilizationTarget}% of its limit, cheapest crossing first — an over-limit card comes first because that's a few dollars and stops an active harm. It targets your credit score rather than your interest bill, and once every card is under the line the plan goes back to avalanche.`}{" "}
          Every cleared debt rolls its payment into the snowball, keeping your total outlay at{" "}
          {formatCurrency(plan.budget)}/mo
          {extraPerPaycheck !== null &&
            ` (snowball ≈ ${formatCurrency(Math.round(extraPerPaycheck))} per paycheck)`}
          .
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
              <li key={p.id} className="flex items-center justify-between gap-3 py-1">
                <span>
                  <span className="mr-2 inline-block w-5 text-right text-neutral-400">
                    {i + 1}.
                  </span>
                  {p.name}
                  {p.type === "bnpl" && (
                    <span className="ml-2 text-xs text-neutral-400">BNPL</span>
                  )}
                </span>
                <span className="text-right text-xs text-neutral-500">
                  <span className="block text-sm">
                    {plan.capped ? "—" : format(addMonths(today, p.month), "MMM yyyy")}
                  </span>
                  {p.freed > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      frees {formatCurrency(p.freed)}/mo → snowball{" "}
                      {formatCurrency(p.snowballAfter)}/mo
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <Link
            href={`/plan/payoff?strategy=${strategy}&extra=${extra}`}
            className="mt-4 inline-block text-sm font-medium underline underline-offset-2"
          >
            See the detailed step-by-step plan →
          </Link>
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
