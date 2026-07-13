"use client";

import { useMemo, useState } from "react";
import { Card, inputClass, ghostButtonClass } from "@/components/card";
import { formatCurrency, monthsToPayoff, totalInterestPaid } from "@/lib/calc/money";
import type { Debt } from "@/lib/supabase/types";
import { addPayment, deleteDebt } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  credit_card: "Credit card",
  student_loan: "Student loan",
  auto_loan: "Auto loan",
  personal_loan: "Personal loan",
  mortgage: "Mortgage",
  medical: "Medical",
  other: "Other",
};

export function DebtCard({ debt }: { debt: Debt }) {
  const [payment, setPayment] = useState(debt.minimum_payment || 0);

  const months = useMemo(() => monthsToPayoff(debt.balance, debt.interest_rate, payment), [debt, payment]);
  const interest = useMemo(() => totalInterestPaid(debt.balance, debt.interest_rate, payment), [debt, payment]);

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{debt.name}</h3>
          <p className="text-xs text-neutral-500">
            {TYPE_LABEL[debt.type]} · {debt.interest_rate}% APR
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{formatCurrency(debt.balance)}</p>
          <p className="text-xs text-neutral-500">min {formatCurrency(debt.minimum_payment)}/mo</p>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-800/50">
        <label className="flex items-center justify-between gap-2 text-xs text-neutral-500">
          Monthly payment
          <input
            type="number"
            step="0.01"
            min="0"
            value={payment}
            onChange={(e) => setPayment(Number(e.target.value) || 0)}
            className={`${inputClass} w-28 py-1`}
          />
        </label>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">
          {months === null
            ? "This payment won't cover interest — increase it to make progress."
            : `Paid off in ${months} month${months === 1 ? "" : "s"} · ${formatCurrency(interest ?? 0)} total interest`}
        </p>
      </div>

      <form action={addPayment} className="mt-3 flex gap-2">
        <input type="hidden" name="debt_id" value={debt.id} />
        <input name="amount" type="number" step="0.01" min="0.01" placeholder="Log a payment" required className={`${inputClass} flex-1 text-sm`} />
        <button type="submit" className={`${ghostButtonClass} text-xs`}>
          Log payment
        </button>
      </form>
      <form action={deleteDebt} className="mt-2 text-right">
        <input type="hidden" name="id" value={debt.id} />
        <button className="text-xs text-red-500 hover:underline">delete</button>
      </form>
    </Card>
  );
}
