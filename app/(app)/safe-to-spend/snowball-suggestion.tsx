"use client";

import { useState } from "react";
import { inputClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import type { SnowballSuggestion } from "@/lib/calc/snowball-assign";

/**
 * The app's pick for where the next extra debt payment should come from. It's a
 * prompt, not a commitment — nothing leaves free-to-spend until it's assigned,
 * and the amount stays editable because the suggestion can't know everything.
 */
export function SnowballSuggestionRow({
  suggestion,
  onAssign,
}: {
  suggestion: SnowballSuggestion;
  onAssign: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState(suggestion.amount);
  const [busy, setBusy] = useState(false);

  const left = Math.round((suggestion.freeBefore - amount) * 100) / 100;
  const overdraws = left < 0;

  return (
    <div className="mt-3 rounded-lg border border-dashed border-purple-300 bg-purple-50/60 p-3 dark:border-purple-500/40 dark:bg-purple-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-purple-800 dark:text-purple-200">
          Best paycheck for an extra payment → {suggestion.targetName}
          {suggestion.paysOff && (
            <span className="ml-2 font-normal text-emerald-700 dark:text-emerald-400">
              clears it 🎉
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="10"
            value={amount || ""}
            onChange={(e) => setAmount(Math.max(Number(e.target.value) || 0, 0))}
            className={`${inputClass} w-28 py-1 text-sm`}
            aria-label="Extra payment amount"
          />
          <button
            disabled={busy || amount <= 0 || overdraws}
            onClick={async () => {
              setBusy(true);
              try {
                await onAssign(amount);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-purple-500"
          >
            {busy ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-purple-900/70 dark:text-purple-200/70">
        {suggestion.reason} Leaves {formatCurrency(Math.max(left, 0))} free on this paycheck
        {overdraws && " — that's more than this paycheck has"}.
      </p>
    </div>
  );
}
