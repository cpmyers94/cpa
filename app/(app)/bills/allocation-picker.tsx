"use client";

import { useAuth } from "@/components/auth";
import { inputClass, ghostButtonClass } from "@/components/card";
import { formatDate } from "@/lib/calc/money";
import type { ObligationType } from "@/lib/supabase/types";
import { allocateObligation, unallocateObligation } from "./mutations";

export type PaycheckOption = { incomeSourceId: string; incomeSourceName: string; date: string };

export function AllocationPicker({
  obligationType,
  obligationId,
  dueDate,
  options,
  current,
  onChanged,
}: {
  obligationType: ObligationType;
  obligationId: string;
  dueDate: string;
  options: PaycheckOption[];
  current: { id: string; incomeSourceName: string; paycheckDate: string } | null;
  onChanged: () => void;
}) {
  const { supabase, user } = useAuth();

  if (current) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>
          Covered by {current.incomeSourceName} · {formatDate(current.paycheckDate)}
        </span>
        <button
          onClick={async () => {
            await unallocateObligation(supabase, current.id);
            onChanged();
          }}
          className="text-red-500 hover:underline"
        >
          clear
        </button>
      </div>
    );
  }

  if (options.length === 0) {
    return <span className="text-xs text-neutral-400">No upcoming paycheck to assign</span>;
  }

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const formData = new FormData(event.currentTarget);
    const [incomeSourceId, paycheckDate] = String(formData.get("paycheck")).split("|");
    if (!incomeSourceId || !paycheckDate) return;
    await allocateObligation(
      supabase,
      user.id,
      obligationType,
      obligationId,
      dueDate,
      incomeSourceId,
      paycheckDate
    );
    onChanged();
  }

  return (
    <form onSubmit={handleAssign} className="flex items-center gap-2">
      <select name="paycheck" required className={`${inputClass} py-1 text-xs`} defaultValue="">
        <option value="" disabled>
          Assign to paycheck…
        </option>
        {options.map((o) => (
          <option key={`${o.incomeSourceId}|${o.date}`} value={`${o.incomeSourceId}|${o.date}`}>
            {o.incomeSourceName} · {formatDate(o.date)}
          </option>
        ))}
      </select>
      <button type="submit" className={`${ghostButtonClass} py-1 text-xs`}>
        Assign
      </button>
    </form>
  );
}
