"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { formatCurrency } from "@/lib/calc/money";
import type { PaycheckDeduction } from "@/lib/supabase/types";
import { inputClass, ghostButtonClass } from "@/components/card";
import { addDeduction, deleteDeduction, updateDeduction } from "./mutations";

export function Deductions({
  incomeSourceId,
  deductions,
  editable,
  onChanged,
}: {
  incomeSourceId: string;
  deductions: PaycheckDeduction[];
  editable: boolean;
  onChanged: () => void;
}) {
  const { supabase, user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    await addDeduction(supabase, user.id, incomeSourceId, new FormData(form));
    form.reset();
    onChanged();
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    await updateDeduction(supabase, id, new FormData(event.currentTarget));
    setEditingId(null);
    onChanged();
  }

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <ul className="flex flex-col gap-1 text-sm">
        {deductions.map((d) =>
          editingId === d.id ? (
            <li key={d.id}>
              <form onSubmit={(e) => handleEdit(e, d.id)} className="flex flex-wrap gap-2">
                <input name="label" defaultValue={d.label} required className={`${inputClass} flex-1`} />
                <select name="kind" defaultValue={d.kind} className={inputClass}>
                  <option value="pretax">Pretax</option>
                  <option value="tax">Tax</option>
                  <option value="posttax">Post-tax</option>
                </select>
                <input name="amount" type="number" step="0.01" min="0" defaultValue={d.amount} required className={`${inputClass} w-24`} />
                <button type="submit" className={ghostButtonClass}>
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-neutral-500 hover:underline">
                  cancel
                </button>
              </form>
            </li>
          ) : (
            <li
              key={d.id}
              className="flex items-center justify-between text-neutral-600 dark:text-neutral-400"
            >
              <span>
                {d.label} <span className="text-xs uppercase text-neutral-400">({d.kind})</span>
              </span>
              <span className="flex items-center gap-2">
                -{formatCurrency(d.amount)}
                {editable && (
                  <>
                    <button
                      onClick={() => setEditingId(d.id)}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      edit
                    </button>
                    <button
                      onClick={async () => {
                        await deleteDeduction(supabase, d.id);
                        onChanged();
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      remove
                    </button>
                  </>
                )}
              </span>
            </li>
          )
        )}
        {deductions.length === 0 && <li className="text-neutral-400">No deductions yet.</li>}
      </ul>
      {!editable ? null : (
      <form onSubmit={handleAdd} className="mt-2 flex flex-wrap gap-2">
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
      )}
    </div>
  );
}
