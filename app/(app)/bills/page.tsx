import { addDays } from "date-fns";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/supabase/user";
import { Card } from "@/components/card";
import { formatCurrency } from "@/lib/calc/money";
import { getBillOccurrences } from "@/lib/calc/bills";
import { getPaycheckOccurrences } from "@/lib/calc/schedule";
import type { Bill, BillAllocation, IncomeSource } from "@/lib/supabase/types";
import { BillForm } from "./bill-form";
import { deleteBill } from "./actions";
import { AllocationPicker, type PaycheckOption } from "./allocation-picker";

const WINDOW_DAYS = 60;

export default async function BillsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { supabase, user } = await requireUser();

  const [{ data: bills }, { data: incomeSources }, { data: allocations }] = await Promise.all([
    supabase.from("bills").select("*").eq("user_id", user.id).eq("active", true).order("created_at"),
    supabase.from("income_sources").select("*").eq("user_id", user.id).eq("active", true),
    supabase.from("bill_allocations").select("*").eq("user_id", user.id),
  ]);

  const billList = (bills ?? []) as Bill[];
  const sources = (incomeSources ?? []) as IncomeSource[];
  const allocationList = (allocations ?? []) as BillAllocation[];

  const today = new Date();
  const rangeEnd = addDays(today, WINDOW_DAYS);

  const paycheckOptions: PaycheckOption[] = sources.flatMap((source) =>
    getPaycheckOccurrences(source, addDays(today, -WINDOW_DAYS), rangeEnd).map((date) => ({
      incomeSourceId: source.id,
      incomeSourceName: source.name,
      date: date.toISOString().slice(0, 10),
    }))
  );

  const occurrences = billList.flatMap((bill) =>
    getBillOccurrences(bill, today, rangeEnd).map((date) => ({ bill, date: date.toISOString().slice(0, 10) }))
  );
  occurrences.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-6">
      <Card title="Add a bill">
        <BillForm />
      </Card>

      <Card title={`Upcoming bills (next ${WINDOW_DAYS} days)`}>
        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {occurrences.map(({ bill, date }) => {
            const allocation = allocationList.find((a) => a.bill_id === bill.id && a.bill_due_date === date);
            const source = allocation ? sources.find((s) => s.id === allocation.income_source_id) : null;
            const optionsBeforeDue = paycheckOptions.filter((o) => o.date <= date);

            return (
              <div key={`${bill.id}-${date}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                        ? { id: allocation.id, incomeSourceName: source.name, paycheckDate: allocation.paycheck_date }
                        : null
                    }
                  />
                </div>
              </div>
            );
          })}
          {occurrences.length === 0 && <p className="py-3 text-sm text-neutral-500">No upcoming bills.</p>}
        </div>
      </Card>

      <Card title="All bills">
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {billList.map((bill) => (
            <li key={bill.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {bill.name} · {formatCurrency(bill.amount)} · {bill.frequency.replace("_", " ")}
              </span>
              <form action={deleteBill}>
                <input type="hidden" name="id" value={bill.id} />
                <button className="text-xs text-red-500 hover:underline">delete</button>
              </form>
            </li>
          ))}
          {billList.length === 0 && <li className="py-2 text-sm text-neutral-500">No bills yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
