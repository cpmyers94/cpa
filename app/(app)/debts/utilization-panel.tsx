"use client";

import { Card } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { utilizationPlan, utilizationSummary } from "@/lib/debts/utilization";
import type { Debt, DebtSegment } from "@/lib/supabase/types";

function barColor(percent: number, target: number): string {
  if (percent > 100) return "bg-red-600";
  if (percent > target) return "bg-amber-500";
  return "bg-emerald-500";
}

/**
 * Utilization at a glance, then the order to fix it in. The bars are the
 * "where am I" and the steps are the "what do I do about it" — a percentage
 * with no payment attached to it isn't actionable.
 */
export function UtilizationPanel({
  debts,
  segments,
  target,
  perPaycheckBudget,
}: {
  debts: Debt[];
  segments: DebtSegment[];
  target: number;
  perPaycheckBudget: number;
}) {
  const summary = utilizationSummary(debts, segments, target);
  if (summary.cards.length === 0) return null;

  const steps = utilizationPlan(debts, segments, target, perPaycheckBudget);

  return (
    <Card title={`Credit utilization (target ${target}%)`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <p
            className={`text-2xl font-bold ${
              summary.aggregatePercent > target
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {summary.aggregatePercent}%
          </p>
          <p className="text-xs text-neutral-500">
            overall · {formatCurrency(summary.totalBalance)} of{" "}
            {formatCurrency(summary.totalLimit)}
          </p>
        </div>
        {summary.allCardsToTarget > 0 && (
          <div>
            <p className="text-lg font-semibold">
              {formatCurrency(summary.allCardsToTarget)}
            </p>
            <p className="text-xs text-neutral-500">to get every card under {target}%</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {summary.cards.map((c) => (
          <div key={c.debtId}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {c.name}
                {c.overLimit && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    OVER LIMIT
                  </span>
                )}
              </span>
              <span className={c.atTarget ? "text-emerald-600 dark:text-emerald-400" : ""}>
                {c.percent}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={`h-full rounded-full ${barColor(c.percent, target)}`}
                style={{ width: `${Math.min(c.percent, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {formatCurrency(c.balance)} of {formatCurrency(c.limit)} ·{" "}
              {c.atTarget ? (
                <span className="text-emerald-600 dark:text-emerald-400">at target 🎉</span>
              ) : (
                `${formatCurrency(c.toTarget)} to reach ${target}%`
              )}
            </p>
          </div>
        ))}
      </div>

      {steps.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <p className="mb-2 text-xs font-medium">Cheapest wins first</p>
          <ol className="flex flex-col gap-1.5 text-xs">
            {steps.map((s, i) => (
              <li key={`${s.debtId}-${s.milestone}`} className="flex justify-between gap-3">
                <span className="text-neutral-600 dark:text-neutral-400">
                  {i + 1}. {s.name}{" "}
                  {s.milestone === "under_limit" ? (
                    <span className="text-red-600 dark:text-red-400">back under the limit</span>
                  ) : (
                    <>under {target}%</>
                  )}
                  {s.paychecks > 0 && (
                    <span className="text-neutral-400">
                      {" "}
                      · by paycheck {s.paychecks} → {s.aggregateAfter}% overall
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap font-medium">
                  {formatCurrency(s.milestoneCost)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        Utilization is read from the balance each card <em>reports</em>, which is the statement
        balance — so paying before the statement closes counts this cycle rather than next. It
        also has no memory: unlike a late payment, a high balance stops hurting the month after
        it comes down.
      </p>
    </Card>
  );
}
