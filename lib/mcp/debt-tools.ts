import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths } from "date-fns";
import {
  bnplScheduledTotal,
  debtPayoff,
  monthlyBnplObligation,
  orderedSnowballTargets,
  simulatePayoff,
  type Strategy,
} from "../calc/debt-plan";
import { buildDebtPayload, type DebtInput } from "../debts/payload";
import type { Debt, DebtType, InstallmentFrequency } from "../supabase/types";

/**
 * Debt tools: view and edit debts through a tool interface, so an assistant can
 * work with them in conversation. Deliberately transport-agnostic — the same
 * definitions and handlers back a local MCP server, a remote MCP connector, or
 * an in-app advisor. Everything goes through the caller's Supabase client, so
 * row-level security still scopes every read and write to their household.
 */

export interface DebtToolContext {
  supabase: SupabaseClient;
  /** The acting user; stamped on rows they author. */
  userId: string;
}

export interface DebtToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  /** True when the tool changes data — confirm with the user before running. */
  writes: boolean;
  /** True when the change is hard to undo. */
  destructive?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const DEBT_TYPES: DebtType[] = [
  "credit_card",
  "student_loan",
  "auto_loan",
  "personal_loan",
  "mortgage",
  "medical",
  "bnpl",
  "other",
];

const FREQUENCIES: InstallmentFrequency[] = ["weekly", "biweekly", "monthly"];

/** Per-month cash a BNPL plan takes at its current cadence. */
function bnplMonthlyObligation(debt: Debt): number {
  const per =
    debt.installment_frequency === "weekly"
      ? 4
      : debt.installment_frequency === "biweekly"
        ? 2
        : 1;
  const count = Math.min(per, debt.payments_remaining ?? 0);
  return round2(count * (debt.installment_amount ?? 0));
}

/** Model-facing view of a debt, with the derived numbers already worked out. */
export function describeDebt(debt: Debt): Record<string, unknown> {
  const payoff = round2(debtPayoff(debt));

  if (debt.type === "bnpl") {
    const scheduled = round2(bnplScheduledTotal(debt));
    return {
      id: debt.id,
      name: debt.name.trim(),
      type: debt.type,
      payoff_today: payoff,
      scheduled_total: scheduled,
      early_payoff_savings: round2(Math.max(scheduled - payoff, 0)),
      installment_amount: debt.installment_amount,
      payments_remaining: debt.payments_remaining,
      installment_frequency: debt.installment_frequency,
      next_payment_date: debt.next_payment_date,
      monthly_obligation: bnplMonthlyObligation(debt),
      settlement_amount_known: debt.settlement_amount != null,
    };
  }

  return {
    id: debt.id,
    name: debt.name.trim(),
    type: debt.type,
    payoff_today: payoff,
    balance: debt.balance,
    interest_rate_apr: debt.interest_rate,
    minimum_payment: debt.minimum_payment,
    due_day: debt.due_day,
  };
}

async function loadDebts(ctx: DebtToolContext): Promise<Debt[]> {
  const { data, error } = await ctx.supabase.from("debts").select("*").order("created_at");
  if (error) throw new Error(`Could not load debts: ${error.message}`);
  return (data ?? []) as Debt[];
}

/**
 * Resolves a debt by id or name. Names are matched case- and
 * whitespace-insensitively (stored names often carry a trailing space), then by
 * prefix, so "capital one" finds "Capital One ". Ambiguity is an error rather
 * than a guess — picking the wrong debt would write to the wrong account.
 */
export async function resolveDebt(ctx: DebtToolContext, nameOrId: string): Promise<Debt> {
  const debts = await loadDebts(ctx);
  const needle = nameOrId.trim().toLowerCase();

  const byId = debts.find((d) => d.id === nameOrId);
  if (byId) return byId;

  const exact = debts.filter((d) => d.name.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0];

  const partial = debts.filter((d) => d.name.trim().toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];

  const names = debts.map((d) => d.name.trim()).join(", ");
  if (partial.length > 1) {
    throw new Error(
      `"${nameOrId}" matches more than one debt: ${partial
        .map((d) => d.name.trim())
        .join(", ")}. Use the exact name or the id.`
    );
  }
  throw new Error(`No debt matches "${nameOrId}". Tracked debts: ${names || "(none)"}.`);
}

function debtToInput(debt: Debt): DebtInput {
  return {
    name: debt.name,
    type: debt.type,
    balance: debt.balance,
    interest_rate: debt.interest_rate,
    minimum_payment: debt.minimum_payment,
    due_day: debt.due_day,
    installment_amount: debt.installment_amount,
    payments_remaining: debt.payments_remaining,
    installment_frequency: debt.installment_frequency,
    next_payment_date: debt.next_payment_date,
    settlement_amount: debt.settlement_amount,
    // Preserve the stored balance so a partial edit doesn't recompute it back
    // to installment × payments and lose a stub-corrected total.
    scheduled_balance: debt.type === "bnpl" ? debt.balance : null,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const debtFields = {
  name: { type: "string", description: "Debt name, e.g. 'Bike shop'." },
  type: { type: "string", enum: DEBT_TYPES, description: "Kind of debt." },
  balance: { type: "number", description: "Current balance (non-BNPL)." },
  interest_rate: { type: "number", description: "APR percent, e.g. 27.5 (non-BNPL)." },
  minimum_payment: { type: "number", description: "Monthly minimum (non-BNPL)." },
  due_day: { type: "integer", description: "Day of month the payment is due, 1-31." },
  installment_amount: { type: "number", description: "BNPL: amount per installment." },
  payments_remaining: { type: "integer", description: "BNPL: installments left." },
  installment_frequency: {
    type: "string",
    enum: FREQUENCIES,
    description: "BNPL: how often installments are taken.",
  },
  next_payment_date: { type: "string", description: "BNPL: next payment date, YYYY-MM-DD." },
  settlement_amount: {
    type: "number",
    description:
      "BNPL: the lender's payoff-today figure. Usually less than the scheduled total because unearned interest is waived — this is what the snowball pays to clear the plan early.",
  },
  scheduled_balance: {
    type: "number",
    description:
      "BNPL: the lender's real remaining balance. Set this when the final payment is a stub rather than a full installment, otherwise the total is overstated.",
  },
} as const;

export const debtTools: DebtToolDefinition[] = [
  {
    name: "list_debts",
    description:
      "List every tracked debt with its payoff-today amount, and totals for the whole debt load. Use this to answer 'what do I owe' or before editing, to see exact names.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    writes: false,
  },
  {
    name: "get_debt",
    description: "Look up one debt in detail by name or id.",
    inputSchema: {
      type: "object",
      properties: { debt: { type: "string", description: "Debt name or id." } },
      required: ["debt"],
      additionalProperties: false,
    },
    writes: false,
  },
  {
    name: "get_payoff_plan",
    description:
      "Get the get-out-of-debt plan: the order debts are attacked, when each clears, and the payment each one frees. Snowball targets the smallest payoff first; avalanche the highest interest rate.",
    inputSchema: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: ["snowball", "avalanche"] },
        extra_per_month: {
          type: "number",
          description: "Extra beyond the minimums each month. Defaults to 0.",
        },
      },
      additionalProperties: false,
    },
    writes: false,
  },
  {
    name: "add_debt",
    description:
      "Add a new debt. For BNPL give installment_amount, payments_remaining, installment_frequency and next_payment_date; add settlement_amount and scheduled_balance when the lender shows them.",
    inputSchema: {
      type: "object",
      properties: debtFields,
      required: ["name", "type"],
      additionalProperties: false,
    },
    writes: true,
  },
  {
    name: "update_debt",
    description:
      "Change fields on an existing debt. Only the fields you pass are changed. Note: on a BNPL plan, changing installment_amount or payments_remaining recomputes the remaining balance unless you also pass scheduled_balance.",
    inputSchema: {
      type: "object",
      properties: {
        debt: { type: "string", description: "Debt name or id to update." },
        ...debtFields,
      },
      required: ["debt"],
      additionalProperties: false,
    },
    writes: true,
  },
  {
    name: "delete_debt",
    description: "Permanently delete a debt and its payment history.",
    inputSchema: {
      type: "object",
      properties: { debt: { type: "string", description: "Debt name or id." } },
      required: ["debt"],
      additionalProperties: false,
    },
    writes: true,
    destructive: true,
  },
  {
    name: "log_payment",
    description:
      "Record a payment against a non-BNPL debt and reduce its balance. For BNPL plans use log_bnpl_installment instead.",
    inputSchema: {
      type: "object",
      properties: {
        debt: { type: "string", description: "Debt name or id." },
        amount: { type: "number", description: "Amount paid." },
      },
      required: ["debt", "amount"],
      additionalProperties: false,
    },
    writes: true,
  },
  {
    name: "log_bnpl_installment",
    description:
      "Record one BNPL installment as paid: logs the payment, decrements the remaining count, advances the next payment date, and lowers the payoff figure.",
    inputSchema: {
      type: "object",
      properties: { debt: { type: "string", description: "BNPL debt name or id." } },
      required: ["debt"],
      additionalProperties: false,
    },
    writes: true,
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

const str = (a: Args, k: string) => (a[k] == null ? undefined : String(a[k]));
const numOf = (a: Args, k: string) => (a[k] == null ? undefined : Number(a[k]));

async function listDebts(ctx: DebtToolContext) {
  const debts = await loadDebts(ctx);
  const active = debts.filter((d) => debtPayoff(d) > 0);
  const monthlyMinimums = active
    .filter((d) => d.type !== "bnpl")
    .reduce((sum, d) => sum + d.minimum_payment, 0);
  return {
    debts: debts.map(describeDebt),
    totals: {
      count: debts.length,
      total_payoff_today: round2(debts.reduce((sum, d) => sum + debtPayoff(d), 0)),
      monthly_minimums: round2(monthlyMinimums),
      monthly_bnpl: round2(monthlyBnplObligation(debts)),
    },
  };
}

async function getPayoffPlan(ctx: DebtToolContext, args: Args) {
  const debts = await loadDebts(ctx);
  const strategy: Strategy = args.strategy === "avalanche" ? "avalanche" : "snowball";
  const extra = numOf(args, "extra_per_month") ?? 0;
  const active = debts.filter((d) => debtPayoff(d) > 0);
  if (active.length === 0) return { strategy, message: "No debts — nothing to plan." };

  const plan = simulatePayoff(active, extra, strategy);
  return {
    strategy,
    extra_per_month: extra,
    monthly_outlay: plan.budget,
    months_to_debt_free: plan.capped ? null : plan.months,
    total_interest: plan.totalInterest,
    attack_order: orderedSnowballTargets(active, strategy).map((t) => t.name.trim()),
    payoffs: plan.payoffs.map((p) => ({
      name: p.name.trim(),
      month: p.month,
      frees_per_month: p.freed,
      snowball_after: p.snowballAfter,
    })),
  };
}

async function addDebt(ctx: DebtToolContext, args: Args) {
  const type = str(args, "type") as DebtType;
  if (!DEBT_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${DEBT_TYPES.join(", ")}`);
  }
  const payload = buildDebtPayload({
    name: String(args.name),
    type,
    balance: numOf(args, "balance"),
    interest_rate: numOf(args, "interest_rate"),
    minimum_payment: numOf(args, "minimum_payment"),
    due_day: numOf(args, "due_day"),
    installment_amount: numOf(args, "installment_amount"),
    payments_remaining: numOf(args, "payments_remaining"),
    installment_frequency: str(args, "installment_frequency") as InstallmentFrequency,
    next_payment_date: str(args, "next_payment_date") ?? null,
    settlement_amount: numOf(args, "settlement_amount"),
    scheduled_balance: numOf(args, "scheduled_balance"),
  });

  const { data, error } = await ctx.supabase
    .from("debts")
    .insert({ user_id: ctx.userId, ...payload })
    .select()
    .single();
  if (error) throw new Error(`Could not add debt: ${error.message}`);
  return { added: describeDebt(data as Debt) };
}

async function updateDebt(ctx: DebtToolContext, args: Args) {
  const existing = await resolveDebt(ctx, String(args.debt));
  const base = debtToInput(existing);

  // Changing the installment schedule should move the total with it, unless the
  // caller states the real balance.
  const reschedules =
    args.installment_amount != null || args.payments_remaining != null;
  const scheduledBalance =
    numOf(args, "scheduled_balance") ?? (reschedules ? null : base.scheduled_balance);

  const merged: DebtInput = {
    ...base,
    name: str(args, "name") ?? base.name,
    type: (str(args, "type") as DebtType) ?? base.type,
    balance: numOf(args, "balance") ?? base.balance,
    interest_rate: numOf(args, "interest_rate") ?? base.interest_rate,
    minimum_payment: numOf(args, "minimum_payment") ?? base.minimum_payment,
    due_day: numOf(args, "due_day") ?? base.due_day,
    installment_amount: numOf(args, "installment_amount") ?? base.installment_amount,
    payments_remaining: numOf(args, "payments_remaining") ?? base.payments_remaining,
    installment_frequency:
      (str(args, "installment_frequency") as InstallmentFrequency) ??
      base.installment_frequency,
    next_payment_date: str(args, "next_payment_date") ?? base.next_payment_date,
    settlement_amount: numOf(args, "settlement_amount") ?? base.settlement_amount,
    scheduled_balance: scheduledBalance,
  };

  const { data, error } = await ctx.supabase
    .from("debts")
    .update(buildDebtPayload(merged))
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw new Error(`Could not update debt: ${error.message}`);
  return { before: describeDebt(existing), after: describeDebt(data as Debt) };
}

async function deleteDebt(ctx: DebtToolContext, args: Args) {
  const debt = await resolveDebt(ctx, String(args.debt));
  const { error } = await ctx.supabase.from("debts").delete().eq("id", debt.id);
  if (error) throw new Error(`Could not delete debt: ${error.message}`);
  return { deleted: describeDebt(debt) };
}

async function logPayment(ctx: DebtToolContext, args: Args) {
  const debt = await resolveDebt(ctx, String(args.debt));
  if (debt.type === "bnpl") {
    throw new Error(
      `${debt.name.trim()} is a BNPL plan — use log_bnpl_installment so the schedule and payoff stay in sync.`
    );
  }
  const amount = Number(args.amount);
  if (!(amount > 0)) throw new Error("amount must be greater than 0.");

  const { error: payErr } = await ctx.supabase
    .from("debt_payments")
    .insert({ user_id: ctx.userId, debt_id: debt.id, amount });
  if (payErr) throw new Error(`Could not log payment: ${payErr.message}`);

  const balance = round2(Math.max(debt.balance - amount, 0));
  const { data, error } = await ctx.supabase
    .from("debts")
    .update({ balance })
    .eq("id", debt.id)
    .select()
    .single();
  if (error) throw new Error(`Could not update balance: ${error.message}`);
  return { paid: amount, debt: describeDebt(data as Debt) };
}

async function logBnplInstallment(ctx: DebtToolContext, args: Args) {
  const debt = await resolveDebt(ctx, String(args.debt));
  if (debt.type !== "bnpl") {
    throw new Error(`${debt.name.trim()} is not a BNPL plan — use log_payment.`);
  }
  const before = debt.payments_remaining ?? 0;
  if (before <= 0) throw new Error(`${debt.name.trim()} has no installments left.`);

  const installment = debt.installment_amount ?? 0;
  const remaining = before - 1;
  // The early-payoff figure shrinks as installments land, reaching 0 with the last one.
  const settlement =
    debt.settlement_amount == null
      ? null
      : round2((debt.settlement_amount * remaining) / before);

  const { error: payErr } = await ctx.supabase
    .from("debt_payments")
    .insert({ user_id: ctx.userId, debt_id: debt.id, amount: installment });
  if (payErr) throw new Error(`Could not log installment: ${payErr.message}`);

  let nextDate: string | null = null;
  if (remaining > 0 && debt.next_payment_date) {
    const [y, m, d] = debt.next_payment_date.split("-").map(Number);
    const current = new Date(y, m - 1, d);
    const next =
      debt.installment_frequency === "weekly"
        ? addDays(current, 7)
        : debt.installment_frequency === "biweekly"
          ? addDays(current, 14)
          : addMonths(current, 1);
    nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
      next.getDate()
    ).padStart(2, "0")}`;
  }

  const { data, error } = await ctx.supabase
    .from("debts")
    .update({
      balance: round2(Math.max(debt.balance - installment, 0)),
      payments_remaining: remaining,
      next_payment_date: nextDate,
      settlement_amount: settlement,
    })
    .eq("id", debt.id)
    .select()
    .single();
  if (error) throw new Error(`Could not update plan: ${error.message}`);
  return { paid: installment, debt: describeDebt(data as Debt) };
}

const handlers: Record<
  string,
  (ctx: DebtToolContext, args: Args) => Promise<unknown>
> = {
  list_debts: (ctx) => listDebts(ctx),
  get_debt: async (ctx, args) => ({
    debt: describeDebt(await resolveDebt(ctx, String(args.debt))),
  }),
  get_payoff_plan: getPayoffPlan,
  add_debt: addDebt,
  update_debt: updateDebt,
  delete_debt: deleteDebt,
  log_payment: logPayment,
  log_bnpl_installment: logBnplInstallment,
};

/** Runs one debt tool by name. Unknown names and bad input throw. */
export async function runDebtTool(
  ctx: DebtToolContext,
  name: string,
  args: Args = {}
): Promise<unknown> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool "${name}". Available: ${debtTools.map((t) => t.name).join(", ")}`);
  }
  return handler(ctx, args);
}
