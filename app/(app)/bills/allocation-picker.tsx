"use client";

import { allocateBill, unallocateBill } from "./actions";
import { inputClass, ghostButtonClass } from "@/components/card";

export type PaycheckOption = { incomeSourceId: string; incomeSourceName: string; date: string };

export function AllocationPicker({
  billId,
  dueDate,
  options,
  current,
}: {
  billId: string;
  dueDate: string;
  options: PaycheckOption[];
  current: { id: string; incomeSourceName: string; paycheckDate: string } | null;
}) {
  if (current) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>
          Covered by {current.incomeSourceName} · {new Date(current.paycheckDate).toLocaleDateString()}
        </span>
        <form action={unallocateBill}>
          <input type="hidden" name="id" value={current.id} />
          <button className="text-red-500 hover:underline">clear</button>
        </form>
      </div>
    );
  }

  if (options.length === 0) {
    return <span className="text-xs text-neutral-400">No upcoming paycheck to assign</span>;
  }

  return (
    <form action={allocateBill} className="flex items-center gap-2">
      <input type="hidden" name="bill_id" value={billId} />
      <input type="hidden" name="bill_due_date" value={dueDate} />
      <select name="paycheck" className={`${inputClass} py-1 text-xs`} defaultValue="">
        <option value="" disabled>
          Assign to paycheck…
        </option>
        {options.map((o) => (
          <option key={`${o.incomeSourceId}|${o.date}`} value={`${o.incomeSourceId}|${o.date}`}>
            {o.incomeSourceName} · {new Date(o.date).toLocaleDateString()}
          </option>
        ))}
      </select>
      <button type="submit" className={`${ghostButtonClass} py-1 text-xs`}>
        Assign
      </button>
    </form>
  );
}
