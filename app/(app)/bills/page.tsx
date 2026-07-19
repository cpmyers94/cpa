"use client";

import { useCallback, useState } from "react";
import { addDays } from "date-fns";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card, ghostButtonClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import { getObligations, type Obligation } from "@/lib/calc/obligations";
import { pickPaycheckForDueDate } from "@/lib/calc/allocate";
import type {
  Bill,
  Debt,
  Expense,
  IncomeSource,
  ObligationAllocation,
  ObligationType,
} from "@/lib/supabase/types";
import { BillForm } from "./bill-form";
import { allocateObligation, deleteBill } from "./mutations";
import { AllocationPicker, type PaycheckOption } from "./allocation-picker";

const WINDOW_DAYS = 60;

const TYPE_BADGE: Record<ObligationType, { label: string; className: string }> = {
  bill: { label: "Bill", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  debt: { label: "Debt", className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  expense: { label: "Subscription", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
};

function allocationColumn(type: ObligationType): "bill_id" | "debt_id" | "expense_id" {
  return type === "bill" ? "bill_id" : type === "debt" ? "debt_id" : "expense_id";
}

export default function BillsPage() {
  const { supabase, user, members, canEdit, nameFor } = useAuth();
  const isShared = members.length > 1;
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    const [billsRes, debtsRes, expensesRes, sourcesRes, allocationsRes] = await Promise.all([
      supabase.from("bills").select("*").eq("active", true).order("created_at"),
      supabase.from("debts").select("*"),
      supabase.from("expenses").select("*").eq("active", true),
      supabase.from("income_sources").select("*").eq("active", true),
      supabase.from("bill_allocations").select("*"),
    ]);
    return {
      bills: (billsRes.data ?? []) as Bill[],
      debts: (debtsRes.data ?? []) as Debt[],
      expenses: (expensesRes.data ?? []) as Expense[],
      sources: (sourcesRes.data ?? []) as IncomeSource[],
      allocations: (allocationsRes.data ?? []) as ObligationAllocation[],
    };
  }, [supabase]);

  const { data, refresh } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  const { bills, debts, expenses, sources, allocations } = data;

  const today = new Date();
  const rangeEnd = addDays(today, WINDOW_DAYS);

  const paycheckOptions: PaycheckOption[] = sources.flatMap((source) =>
    getPaycheckOccurrences(source, addDays(today, -WINDOW_DAYS), rangeEnd).map((date) => ({
      incomeSourceId: source.id,
      incomeSourceName: source.name,
      date: date.toISOString().slice(0, 10),
    }))
  );

  const obligations = getObligations(bills, debts, expenses, today, rangeEnd);

  const findAllocation = (ob: Obligation) => {
    const column = allocationColumn(ob.type);
    return allocations.find((a) => a[column] === ob.id && a.bill_due_date === ob.date);
  };

  const autoAssignable = obligations.filter(
    (ob) => !findAllocation(ob) && pickPaycheckForDueDate(paycheckOptions, ob.date) !== null
  );

  async function autoAssign() {
    if (!user) return;
    setAssigning(true);
    try {
      for (const ob of autoAssignable) {
        const pick = pickPaycheckForDueDate(paycheckOptions, ob.date);
        if (pick) {
          await allocateObligation(
            supabase,
            user.id,
            ob.type,
            ob.id,
            ob.date,
            pick.incomeSourceId,
            pick.date
          );
        }
      }
      await refresh();
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a bill">
        <BillForm onChanged={refresh} />
      </Card>

      <Card
        title={`Upcoming obligations (next ${WINDOW_DAYS} days)`}
        action={
          autoAssignable.length > 0 ? (
            <button onClick={autoAssign} disabled={assigning} className={`${ghostButtonClass} text-xs`}>
              {assigning ? "Assigning…" : `Auto-assign ${autoAssignable.length}`}
            </button>
          ) : undefined
        }
      >
        <p className="mb-3 text-xs text-neutral-500">
          Bills, debt payments, and dated subscriptions your paychecks need to cover. Auto-assign
          fills each unassigned one with the nearest paycheck on or before its due date and never
          changes an assignment you set yourself.
        </p>
        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {obligations.map((ob) => {
            const allocation = findAllocation(ob);
            const source = allocation
              ? sources.find((s) => s.id === allocation.income_source_id)
              : null;
            const optionsBeforeDue = paycheckOptions.filter((o) => o.date <= ob.date);
            const badge = TYPE_BADGE[ob.type];

            return (
              <div
                key={`${ob.type}-${ob.id}-${ob.date}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {ob.name}
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Due {new Date(ob.date).toLocaleDateString()} · {ob.category}
                    {isShared && ` · ${nameFor(ob.userId)}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">{formatCurrency(ob.amount)}</span>
                  <AllocationPicker
                    obligationType={ob.type}
                    obligationId={ob.id}
                    dueDate={ob.date}
                    options={optionsBeforeDue}
                    current={
                      allocation && source
                        ? {
                            id: allocation.id,
                            incomeSourceName: source.name,
                            paycheckDate: allocation.paycheck_date,
                          }
                        : null
                    }
                    onChanged={refresh}
                  />
                </div>
              </div>
            );
          })}
          {obligations.length === 0 && (
            <p className="py-3 text-sm text-neutral-500">Nothing due in the next {WINDOW_DAYS} days.</p>
          )}
        </div>
      </Card>

      <Card title="All bills">
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {bills.map((bill) => (
            <li key={bill.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {bill.name} · {formatCurrency(bill.amount)} · {bill.frequency.replace("_", " ")}
                {isShared && (
                  <span className="ml-2 text-xs text-neutral-400">added by {nameFor(bill.user_id)}</span>
                )}
              </span>
              {canEdit(bill.user_id) && (
                <button
                  onClick={async () => {
                    await deleteBill(supabase, bill.id);
                    refresh();
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  delete
                </button>
              )}
            </li>
          ))}
          {bills.length === 0 && <li className="py-2 text-sm text-neutral-500">No bills yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
