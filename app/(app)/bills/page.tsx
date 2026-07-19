"use client";

import { useCallback, useState } from "react";
import { addDays } from "date-fns";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card, ghostButtonClass } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { getBillOccurrences } from "@/lib/calc/bills";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import { pickPaycheckForDueDate } from "@/lib/calc/allocate";
import type { Bill, BillAllocation, IncomeSource } from "@/lib/supabase/types";
import { BillForm } from "./bill-form";
import { allocateBill, deleteBill } from "./mutations";
import { AllocationPicker, type PaycheckOption } from "./allocation-picker";

const WINDOW_DAYS = 60;

export default function BillsPage() {
  const { supabase, user, members, canEdit, nameFor } = useAuth();
  const isShared = members.length > 1;
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    const [billsRes, sourcesRes, allocationsRes] = await Promise.all([
      supabase.from("bills").select("*").eq("active", true).order("created_at"),
      supabase.from("income_sources").select("*").eq("active", true),
      supabase.from("bill_allocations").select("*"),
    ]);
    return {
      bills: (billsRes.data ?? []) as Bill[],
      sources: (sourcesRes.data ?? []) as IncomeSource[],
      allocations: (allocationsRes.data ?? []) as BillAllocation[],
    };
  }, [supabase]);

  const { data, refresh } = useAsyncData(user ? load : null);

  if (!data) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  const { bills, sources, allocations } = data;

  const today = new Date();
  const rangeEnd = addDays(today, WINDOW_DAYS);

  const paycheckOptions: PaycheckOption[] = sources.flatMap((source) =>
    getPaycheckOccurrences(source, addDays(today, -WINDOW_DAYS), rangeEnd).map((date) => ({
      incomeSourceId: source.id,
      incomeSourceName: source.name,
      date: date.toISOString().slice(0, 10),
    }))
  );

  const occurrences = bills.flatMap((bill) =>
    getBillOccurrences(bill, today, rangeEnd).map((date) => ({
      bill,
      date: date.toISOString().slice(0, 10),
    }))
  );
  occurrences.sort((a, b) => a.date.localeCompare(b.date));

  const isAssigned = (billId: string, date: string) =>
    allocations.some((a) => a.bill_id === billId && a.bill_due_date === date);

  // Unassigned occurrences that have a paycheck landing on or before the due
  // date — the ones auto-assign can actually place.
  const autoAssignable = occurrences.filter(
    ({ bill, date }) =>
      !isAssigned(bill.id, date) && pickPaycheckForDueDate(paycheckOptions, date) !== null
  );

  async function autoAssign() {
    if (!user) return;
    setAssigning(true);
    try {
      for (const { bill, date } of autoAssignable) {
        const pick = pickPaycheckForDueDate(paycheckOptions, date);
        if (pick) {
          await allocateBill(supabase, user.id, bill.id, date, pick.incomeSourceId, pick.date);
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
        title={`Upcoming bills (next ${WINDOW_DAYS} days)`}
        action={
          autoAssignable.length > 0 ? (
            <button onClick={autoAssign} disabled={assigning} className={`${ghostButtonClass} text-xs`}>
              {assigning ? "Assigning…" : `Auto-assign ${autoAssignable.length}`}
            </button>
          ) : undefined
        }
      >
        <p className="mb-3 text-xs text-neutral-500">
          Auto-assign fills each unassigned bill with the nearest paycheck on or before its due
          date. It never changes an assignment you&apos;ve set yourself.
        </p>
        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {occurrences.map(({ bill, date }) => {
            const allocation = allocations.find(
              (a) => a.bill_id === bill.id && a.bill_due_date === date
            );
            const source = allocation
              ? sources.find((s) => s.id === allocation.income_source_id)
              : null;
            const optionsBeforeDue = paycheckOptions.filter((o) => o.date <= date);

            return (
              <div
                key={`${bill.id}-${date}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{bill.name}</p>
                  <p className="text-xs text-neutral-500">
                    Due {new Date(date).toLocaleDateString()} · {bill.category}
                    {bill.autopay && " · autopay"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">{formatCurrency(bill.amount)}</span>
                  <AllocationPicker
                    billId={bill.id}
                    dueDate={date}
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
          {occurrences.length === 0 && (
            <p className="py-3 text-sm text-neutral-500">No upcoming bills.</p>
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
