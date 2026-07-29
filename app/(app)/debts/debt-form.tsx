"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/card";
import { STRUCTURES, structureOf } from "@/lib/debts/segment-input";
import type { CardStructure, Debt, DebtSegment } from "@/lib/supabase/types";
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
  segments = [],
  onChanged,
  onDone,
}: {
  editing?: Debt;
  segments?: DebtSegment[];
  onChanged: () => void;
  onDone?: () => void;
}) {
  const { supabase, user } = useAuth();
  const [type, setType] = useState<string>(editing?.type ?? "credit_card");
  const [structure, setStructure] = useState<CardStructure>(() => structureOf(segments));

  const transfer = segments.find((s) => s.kind === "balance_transfer");
  const purchase = segments.find((s) => s.kind === "purchase");
  const splitCard = structure !== "simple";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) {
      await updateDebt(supabase, editing.id, formData, user.id);
    } else {
      await addDebt(supabase, user.id, formData);
      form.reset();
      setType("credit_card");
      setStructure("simple");
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
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            APR % (optional)
            <input
              name="interest_rate"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 29.99"
              defaultValue={editing?.interest_rate || undefined}
              className={inputClass}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Payoff today (optional)
            <input
              name="settlement_amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 155.46"
              defaultValue={editing?.settlement_amount ?? undefined}
              className={inputClass}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Remaining balance (optional)
            <input
              name="scheduled_balance"
              type="number"
              step="0.01"
              min="0"
              placeholder="if final payment differs"
              defaultValue={editing?.balance ?? undefined}
              className={inputClass}
            />
          </label>
        </>
      ) : (
        <>
          {type === "credit_card" && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
              How is this card carrying a balance?
              <select
                name="card_structure"
                value={structure}
                onChange={(e) => setStructure(e.target.value as CardStructure)}
                className={inputClass}
              >
                {STRUCTURES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-neutral-400">
                {STRUCTURES.find((s) => s.value === structure)?.hint}
              </span>
            </label>
          )}

          {!splitCard && (
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
            </>
          )}

          {splitCard && (
            <>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                Transferred balance
                <input
                  name="transfer_balance"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  defaultValue={transfer?.balance ?? undefined}
                  className={inputClass}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                Transfer APR % (often 0)
                <input
                  name="transfer_apr"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  defaultValue={transfer?.apr ?? 0}
                  className={inputClass}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                Promo ends
                <input
                  name="promo_ends_on"
                  type="date"
                  defaultValue={transfer?.promo_ends_on ?? undefined}
                  className={inputClass}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                Rate after promo %
                <input
                  name="post_promo_apr"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 24.4"
                  defaultValue={transfer?.post_promo_apr ?? undefined}
                  className={inputClass}
                />
              </label>

              {structure === "transfer_and_purchases" && (
                <>
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                    Purchase balance
                    <input
                      name="purchase_balance"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      defaultValue={purchase?.balance ?? undefined}
                      className={inputClass}
                    />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
                    Purchase APR %
                    <input
                      name="purchase_apr"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 24.4"
                      defaultValue={purchase?.apr ?? undefined}
                      className={inputClass}
                    />
                  </label>
                </>
              )}
            </>
          )}

          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-1">
            Min payment /mo
            <input
              name="minimum_payment"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={editing?.minimum_payment || undefined}
              className={inputClass}
            />
          </label>
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
