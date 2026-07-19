"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass } from "@/components/card";
import { addDebt } from "./mutations";

const TYPES: { value: string; label: string }[] = [
  { value: "credit_card", label: "Credit card" },
  { value: "bnpl", label: "BNPL (pay-in-4 / installments)" },
  { value: "student_loan", label: "Student loan" },
  { value: "auto_loan", label: "Auto loan" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
];

export function DebtForm({ onChanged }: { onChanged: () => void }) {
  const { supabase, user } = useAuth();
  const [type, setType] = useState("credit_card");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    await addDebt(supabase, user.id, new FormData(form));
    form.reset();
    setType("credit_card");
    onChanged();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <input name="name" placeholder="Debt name" required className={`${inputClass} col-span-2 sm:col-span-1`} />
      <select
        name="type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        className={`${inputClass} col-span-2 sm:col-span-1`}
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {type === "bnpl" ? (
        <>
          <input
            name="installment_amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Payment amount"
            required
            className={inputClass}
          />
          <input
            name="payments_remaining"
            type="number"
            min="1"
            placeholder="Payments left"
            required
            className={inputClass}
          />
          <select name="installment_frequency" defaultValue="biweekly" className={inputClass}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Next payment date
            <input name="next_payment_date" type="date" required className={inputClass} />
          </label>
        </>
      ) : (
        <>
          <input name="balance" type="number" step="0.01" min="0" placeholder="Balance" required className={inputClass} />
          <input name="interest_rate" type="number" step="0.01" min="0" placeholder="APR %" className={inputClass} />
          <input name="minimum_payment" type="number" step="0.01" min="0" placeholder="Min payment /mo" className={inputClass} />
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Payment due day
            <input name="due_day" type="number" min="1" max="31" defaultValue="1" className={inputClass} />
          </label>
        </>
      )}

      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add debt
      </button>
    </form>
  );
}
