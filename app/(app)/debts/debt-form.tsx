"use client";

import { addDebt } from "./actions";
import { inputClass, buttonClass } from "@/components/card";

const TYPES: { value: string; label: string }[] = [
  { value: "credit_card", label: "Credit card" },
  { value: "student_loan", label: "Student loan" },
  { value: "auto_loan", label: "Auto loan" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
];

export function DebtForm() {
  return (
    <form action={addDebt} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <input name="name" placeholder="Debt name" required className={`${inputClass} col-span-2 sm:col-span-1`} />
      <select name="type" defaultValue="credit_card" className={inputClass}>
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <input name="balance" type="number" step="0.01" min="0" placeholder="Balance" required className={inputClass} />
      <input name="interest_rate" type="number" step="0.01" min="0" placeholder="APR %" className={inputClass} />
      <input name="minimum_payment" type="number" step="0.01" min="0" placeholder="Min payment" className={inputClass} />
      <button type="submit" className={`${buttonClass} col-span-2 sm:col-span-1`}>
        Add debt
      </button>
    </form>
  );
}
