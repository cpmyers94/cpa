"use client";

import { addDeduction, deleteDeduction } from "./actions";
import { formatCurrency } from "@/lib/calc/money";
import type { PaycheckDeduction } from "@/lib/supabase/types";
import { inputClass, ghostButtonClass } from "@/components/card";

export function Deductions({
  incomeSourceId,
  deductions,
}: {
  incomeSourceId: string;
  deductions: PaycheckDeduction[];
}) {
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <ul className="flex flex-col gap-1 text-sm">
        {deductions.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
            <span>
              {d.label} <span className="text-xs uppercase text-neutral-400">({d.kind})</span>
            </span>
            <span className="flex items-center gap-2">
              -{formatCurrency(d.amount)}
              <form action={deleteDeduction}>
                <input type="hidden" name="id" value={d.id} />
                <button className="text-xs text-red-500 hover:underline">remove</button>
              </form>
            </span>
          </li>
        ))}
        {deductions.length === 0 && <li className="text-neutral-400">No deductions yet.</li>}
      </ul>
      <form action={addDeduction} className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="income_source_id" value={incomeSourceId} />
        <input name="label" placeholder="Label (e.g. Federal tax)" required className={`${inputClass} flex-1`} />
        <select name="kind" defaultValue="tax" className={inputClass}>
          <option value="pretax">Pretax</option>
          <option value="tax">Tax</option>
          <option value="posttax">Post-tax</option>
        </select>
        <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className={`${inputClass} w-28`} />
        <button type="submit" className={ghostButtonClass}>
          Add
        </button>
      </form>
    </div>
  );
}
