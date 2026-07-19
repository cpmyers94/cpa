"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth";
import { useAsyncData } from "@/components/use-async-data";
import { Card } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { monthlyExpenses } from "@/lib/calc/obligations";
import type { Expense } from "@/lib/supabase/types";
import { ExpenseForm } from "./expense-form";
import { deleteExpense } from "./mutations";

export default function ExpensesPage() {
  const { supabase, user, members, canEdit, nameFor } = useAuth();
  const isShared = members.length > 1;
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("active", true)
      .order("created_at");
    return (data ?? []) as Expense[];
  }, [supabase]);

  const { data: expenses, refresh } = useAsyncData(user ? load : null);

  if (!expenses) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  const total = monthlyExpenses(expenses);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add an expense">
        <ExpenseForm onChanged={refresh} />
        <p className="mt-3 text-xs text-neutral-500">
          Everyday spending as a monthly budget (groceries, gas, dining). Mark it a subscription
          with a charge day to also pin it to a paycheck in your planning.
        </p>
      </Card>

      <Card title={`Monthly expense budget · ${formatCurrency(total)}`}>
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          {expenses.map((expense) =>
            editingId === expense.id ? (
              <li key={expense.id} className="py-3">
                <ExpenseForm
                  editing={expense}
                  onChanged={refresh}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={expense.id} className="flex items-center justify-between py-2">
                <span>
                  {expense.name} · {expense.category}
                  {expense.is_subscription && (
                    <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {expense.due_day != null ? `subscription · day ${expense.due_day}` : "subscription"}
                    </span>
                  )}
                  {isShared && (
                    <span className="ml-2 text-xs text-neutral-400">added by {nameFor(expense.user_id)}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-medium">{formatCurrency(expense.amount)}/mo</span>
                  {canEdit(expense.user_id) && (
                    <>
                      <button
                        onClick={() => setEditingId(expense.id)}
                        className="text-xs text-neutral-500 hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={async () => {
                          await deleteExpense(supabase, expense.id);
                          refresh();
                        }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        delete
                      </button>
                    </>
                  )}
                </span>
              </li>
            )
          )}
          {expenses.length === 0 && (
            <li className="py-2 text-neutral-500">No expenses yet — add your monthly spending above.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
