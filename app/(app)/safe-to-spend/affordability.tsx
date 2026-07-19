"use client";

import { useState } from "react";
import { inputClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { daysOfDebtFreedom, type PaycheckPlanEntry } from "@/lib/calc/paycheck-plan";

export function Affordability({
  entries,
  monthlyDebtOutlay,
}: {
  entries: PaycheckPlanEntry[];
  monthlyDebtOutlay: number;
}) {
  const [amount, setAmount] = useState<number>(0);
  const [entryIndex, setEntryIndex] = useState(0);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Add an income source to check what you can afford.
      </p>
    );
  }

  const entry = entries[Math.min(entryIndex, entries.length - 1)];
  const newFree = Math.round((entry.freeToSpend - amount) * 100) / 100;
  const days = daysOfDebtFreedom(amount, monthlyDebtOutlay);
  const showResult = amount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Purchase amount
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={amount || ""}
            onChange={(e) => setAmount(Math.max(Number(e.target.value) || 0, 0))}
            className={`${inputClass} w-40 text-lg`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Paid from
          <select
            value={entryIndex}
            onChange={(e) => setEntryIndex(Number(e.target.value))}
            className={inputClass}
          >
            {entries.map((en, i) => (
              <option key={`${en.incomeSourceId}-${en.date}`} value={i}>
                {en.incomeSourceName} · {new Date(en.date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showResult && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            newFree >= 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          <p className="text-base font-semibold">
            {newFree >= 0
              ? `Yes — you'd have ${formatCurrency(newFree)} free on that paycheck.`
              : `That would put the ${new Date(entry.date).toLocaleDateString()} paycheck ${formatCurrency(
                  Math.abs(newFree)
                )} short.`}
          </p>
          <p className="mt-1 opacity-80">
            Free to spend {formatCurrency(entry.freeToSpend)} → {formatCurrency(newFree)} after this
            purchase.
          </p>
          {days !== null && (
            <p className="mt-2 border-t border-current/15 pt-2">
              💸 That&apos;s about <strong>{days} day{days === 1 ? "" : "s"}</strong> added to your
              debt-free date — money that could have gone toward debt. Put it toward debt instead and
              you&apos;d be free ~{days} day{days === 1 ? "" : "s"} sooner.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
