"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import type { Debt } from "@/lib/supabase/types";
import { addDebt, updateDebt } from "./mutations";

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

export function DebtForm({
  editing,
  onChanged,
  onDone,
}: {
  editing?: Debt;
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();
  const [type, setType] = useState<string>(editing?.type ?? "credit_card");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateDebt(supabase, editing.id, formData);
    } else {
      await addDebt(supabase, user.id, formData);
      form.reset();
      setType("credit_card");
    }
    onChanged();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <input
        name="name"
        placeholder="Debt name"
        required
        defaultValue={editing?.name}
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
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
            defaultValue={editing?.installment_amount ?? undefined}
            className={inputClass}
          />
          <input
            name="payments_remaining"
            type="number"
            min="1"
            placeholder="Payments left"
            required
            defaultValue={editing?.payments_remaining ?? undefined}
            className={inputClass}
          />
          <select
            name="installment_frequency"
            defaultValue={editing?.installment_frequency ?? "biweekly"}
            className={inputClass}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Next payment date
            <input
              name="next_payment_date"
              type="date"
              required
              defaultValue={editing?.next_payment_date ?? undefined}
              className={inputClass}
            />
          </label>
        </>
      ) : (
        <>
          <input
            name="balance"
            type="number"
            step="0.01"
            min="0"
            placeholder="Balance"
            required
            defaultValue={editing?.balance ?? undefined}
            className={inputClass}
          />
          <input
            name="interest_rate"
            type="number"
            step="0.01"
            min="0"
            placeholder="APR %"
            defaultValue={editing?.interest_rate ?? undefined}
            className={inputClass}
          />
          <input
            name="minimum_payment"
            type="number"
            step="0.01"
            min="0"
            placeholder="Min payment /mo"
            defaultValue={editing?.minimum_payment ?? undefined}
            className={inputClass}
          />
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Payment due day
            <input
              name="due_day"
              type="number"
              min="1"
              max="31"
              defaultValue={editing?.due_day ?? 1}
              className={inputClass}
            />
          </label>
        </>
      )}

      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button type="submit" className={`${buttonClass} flex-1`}>
          {editing ? "Save" : "Add debt"}
        </button>
        {editing && onDone && (
          <button type="button" onClick={onDone} className={ghostButtonClass}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
