"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, format } from "date-fns";
import { useAuth } from "@/components/auth";
import { Card, inputClass, ghostButtonClass } from "@/components/card";
import { formatCurrency, formatDate, monthsToPayoff, totalInterestPaid } from "@/lib/calc/money";
import { bnplScheduledTotal, debtPayoff } from "@/lib/calc/debt-plan";
import { impliedBnplApr } from "@/lib/calc/bnpl";
import type { Debt } from "@/lib/supabase/types";
import { addPayment, deleteDebt, payBnplInstallment } from "./mutations";
import { DebtForm } from "./debt-form";

const TYPE_LABEL: Record<string, string> = {
  credit_card: "Credit card",
  student_loan: "Student loan",
  auto_loan: "Auto loan",
  personal_loan: "Personal loan",
  mortgage: "Mortgage",
  medical: "Medical",
  bnpl: "BNPL",
  other: "Other",
};

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: "weekly",
  biweekly: "every 2 weeks",
  monthly: "monthly",
};

function bnplCompletionDate(debt: Debt): Date | null {
  if (!debt.next_payment_date || !debt.payments_remaining) return null;
  // Parse as a local-midnight calendar date so date-fns math and format() don't
  // drift a day in negative-offset timezones (new Date("yyyy-mm-dd") is UTC).
  const [y, m, d] = debt.next_payment_date.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const steps = debt.payments_remaining - 1;
  if (debt.installment_frequency === "weekly") return addDays(start, steps * 7);
  if (debt.installment_frequency === "biweekly") return addDays(start, steps * 14);
  return addMonths(start, steps);
}

function BnplBody({ debt, editable, onChanged }: { debt: Debt; editable: boolean; onChanged: () => void }) {
  const { supabase, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const done = bnplCompletionDate(debt);
  const remaining = debt.payments_remaining ?? 0;

  async function logInstallment() {
    if (!user) return;
    setBusy(true);
    try {
      await payBnplInstallment(supabase, user.id, debt);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-800/50">
      {remaining > 0 ? (
        <>
          <p className="text-neutral-600 dark:text-neutral-300">
            {remaining} payment{remaining === 1 ? "" : "s"} of{" "}
            {formatCurrency(debt.installment_amount ?? 0)} left ·{" "}
            {FREQUENCY_LABEL[debt.installment_frequency ?? "monthly"]}
          </p>
          {debt.settlement_amount != null && (
            <p className="mt-1 text-xs text-neutral-500">
              Settle today {formatCurrency(debt.settlement_amount)} ·{" "}
              {formatCurrency(bnplScheduledTotal(debt))} on schedule
              {bnplScheduledTotal(debt) - debt.settlement_amount > 0.005 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {" "}
                  · save {formatCurrency(bnplScheduledTotal(debt) - debt.settlement_amount)} by paying
                  early
                </span>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            {debt.next_payment_date && `Next payment ${formatDate(debt.next_payment_date)}`}
            {done && ` · paid off ${format(done, "MMM d, yyyy")}`}
          </p>
          {editable && (
            <button
              onClick={logInstallment}
              disabled={busy}
              className={`${ghostButtonClass} mt-2 text-xs`}
            >
              {busy ? "Logging…" : "Log installment paid"}
            </button>
          )}
        </>
      ) : (
        <p className="text-emerald-600 dark:text-emerald-400">All installments paid 🎉</p>
      )}
    </div>
  );
}

function RevolvingBody({ debt, editable, onChanged }: { debt: Debt; editable: boolean; onChanged: () => void }) {
  const { supabase, user } = useAuth();
  const [payment, setPayment] = useState(debt.minimum_payment || 0);

  const months = useMemo(
    () => monthsToPayoff(debt.balance, debt.interest_rate, payment),
    [debt, payment]
  );
  const interest = useMemo(
    () => totalInterestPaid(debt.balance, debt.interest_rate, payment),
    [debt, payment]
  );

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const amount = Number(new FormData(form).get("amount"));
    if (!amount) return;
    await addPayment(supabase, user.id, debt.id, debt.balance, amount);
    form.reset();
    onChanged();
  }

  return (
    <>
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

      {editable && (
        <form onSubmit={handlePayment} className="mt-3 flex gap-2">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Log a payment"
            required
            className={`${inputClass} flex-1 text-sm`}
          />
          <button type="submit" className={`${ghostButtonClass} text-xs`}>
            Log payment
          </button>
        </form>
      )}
    </>
  );
}

export function DebtCard({
  debt,
  editable,
  onChanged,
}: {
  debt: Debt;
  editable: boolean;
  onChanged: () => void;
}) {
  const { supabase, members, nameFor } = useAuth();
  const isShared = members.length > 1;
  const isBnpl = debt.type === "bnpl";
  const [editing, setEditing] = useState(false);
  // When a lender payoff was entered but no APR, show the rate it works out to.
  const impliedApr = useMemo(
    () =>
      isBnpl && debt.settlement_amount != null
        ? impliedBnplApr(
            debt.installment_amount ?? 0,
            debt.payments_remaining ?? 0,
            debt.settlement_amount
          )
        : null,
    [isBnpl, debt.settlement_amount, debt.installment_amount, debt.payments_remaining]
  );

  if (editing) {
    return (
      <Card title={`Edit ${debt.name}`}>
        <DebtForm editing={debt} onChanged={onChanged} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">
            {debt.name}
            {isShared && (
              <span className="ml-2 text-xs font-normal text-neutral-400">
                {nameFor(debt.user_id)}
              </span>
            )}
          </h3>
          <p className="text-xs text-neutral-500">
            {TYPE_LABEL[debt.type]}
            {!isBnpl && ` · ${debt.interest_rate}% APR`}
            {isBnpl && debt.interest_rate > 0 && (
              <>
                {" · "}
                {debt.interest_rate}% APR
                {!debt.apr_manual && (
                  <span className="text-neutral-400"> (derived — edit to set your own)</span>
                )}
              </>
            )}
            {isBnpl && debt.interest_rate <= 0 && impliedApr != null && impliedApr > 0 && (
              <> · ~{impliedApr}% APR implied by the payoff</>
            )}
            {isBnpl &&
              debt.interest_rate <= 0 &&
              (impliedApr == null || impliedApr === 0) &&
              " · APR not set"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">
            {formatCurrency(isBnpl ? debtPayoff(debt) : debt.balance)}
          </p>
          <p className="text-xs text-neutral-500">
            {isBnpl
              ? debt.settlement_amount != null
                ? "payoff today"
                : `${formatCurrency(debt.installment_amount ?? 0)} per payment`
              : `min ${formatCurrency(debt.minimum_payment)}/mo`}
          </p>
        </div>
      </div>

      {isBnpl ? (
        <BnplBody debt={debt} editable={editable} onChanged={onChanged} />
      ) : (
        <RevolvingBody debt={debt} editable={editable} onChanged={onChanged} />
      )}

      {editable && (
        <div className="mt-2 flex justify-end gap-3">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-neutral-500 hover:underline"
          >
            edit
          </button>
          <button
            onClick={async () => {
              await deleteDebt(supabase, debt.id);
              onChanged();
            }}
            className="text-xs text-red-500 hover:underline"
          >
            delete
          </button>
        </div>
      )}
    </Card>
  );
}
