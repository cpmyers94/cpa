import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMonths } from "date-fns";
import {
  bnplScheduledTotal,
  debtPayoff,
  monthlyBnplObligation,
  orderedSnowballTargets,
  paychecksPerMonth,
  simulatePayoff,
  type Strategy,
} from "../calc/debt-plan";
import { toScheduledExtras } from "../debts/assignments";
import { promoDeadlines, segmentsFor, SEGMENT_LABEL } from "../debts/segments";
import { minimumAfterPromos, minimumPayment } from "../debts/minimum";
import {
  DEFAULT_UTILIZATION_TARGET,
  utilizationPlan,
  utilizationSummary,
} from "../debts/utilization";
import { buildDebtPayload, type DebtInput } from "../debts/payload";
import type {
  Debt,
  DebtSegment,
  DebtType,
  IncomeSource,
  MinimumRule,
  InstallmentFrequency,
  SnowballPayment,
} from "../supabase/types";

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
export function describeDebt(
  debt: Debt,
  segments: DebtSegment[] = []
): Record<string, unknown> {
  const payoff = round2(debtPayoff(debt, segments));
  const own = segmentsFor(debt.id, segments);

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
      interest_rate_apr: debt.interest_rate,
      apr_source: debt.apr_manual ? "user" : "derived",
      settlement_amount_known: debt.settlement_amount != null,
    };
  }

  return {
    id: debt.id,
    name: debt.name.trim(),
    type: debt.type,
    payoff_today: payoff,
    balance: debt.balance,
    // A split card has no single rate; the segments carry the real ones and
    // interest_rate_apr is only their balance-weighted average.
    interest_rate_apr: debt.interest_rate,
    apr_source: debt.apr_manual ? "user" : "derived",
    minimum_payment: round2(minimumPayment(debt, segments)),
    minimum_rule: debt.minimum_rule,
    ...(debt.credit_limit
      ? {
          credit_limit: debt.credit_limit,
          utilization_percent: round2((payoff / debt.credit_limit) * 100),
        }
      : {}),
    ...(minimumAfterPromos(debt, own)
      ? {
          minimum_after_promo: minimumAfterPromos(debt, own),
        }
      : {}),
    due_day: debt.due_day,
    ...(own.length > 0
      ? {
          segments: own.map((s) => ({
            kind: s.kind,
            label: SEGMENT_LABEL[s.kind],
            balance: s.balance,
            apr: s.apr,
            promo_ends_on: s.promo_ends_on,
            apr_after_promo: s.post_promo_apr,
          })),
        }
      : {}),
  };
}

async function loadSegments(ctx: DebtToolContext): Promise<DebtSegment[]> {
  const { data } = await ctx.supabase.from("debt_segments").select("*");
  return (data ?? []) as DebtSegment[];
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
    apr_manual: debt.apr_manual,
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
  interest_rate: {
    type: "number",
    description:
      "APR percent, e.g. 27.5. BNPL plans have a real APR too (often 25-35%) — setting it marks the rate as user-owned so it won't be overwritten by a derived one.",
  },
  minimum_payment: { type: "number", description: "Monthly minimum (non-BNPL)." },
  minimum_rule: {
    type: "string",
    enum: ["manual", "percent_plus_interest", "percent_of_balance"],
    description:
      "How the minimum is worked out. 'manual' uses minimum_payment; the others compute it from the balance each month.",
  },
  minimum_percent: {
    type: "number",
    description: "Percent of balance for a calculated minimum (default 1).",
  },
  minimum_floor: {
    type: "number",
    description: "Smallest amount the issuer bills for a calculated minimum (default 25).",
  },
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
        strategy: {
          type: "string",
          enum: ["snowball", "avalanche", "utilization"],
          description:
            "snowball = smallest balance first; avalanche = highest rate first; utilization = get each card under its utilization target, for credit-score purposes.",
        },
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
  const [debts, segments] = await Promise.all([loadDebts(ctx), loadSegments(ctx)]);
  const active = debts.filter((d) => debtPayoff(d, segments) > 0);
  const monthlyMinimums = active
    .filter((d) => d.type !== "bnpl")
    .reduce((sum, d) => sum + minimumPayment(d, segments), 0);
  return {
    debts: debts.map((d) => describeDebt(d, segments)),
    totals: {
      count: debts.length,
      total_payoff_today: round2(debts.reduce((sum, d) => sum + debtPayoff(d, segments), 0)),
      monthly_minimums: round2(monthlyMinimums),
      monthly_bnpl: round2(monthlyBnplObligation(debts)),
    },
  };
}

async function getPayoffPlan(ctx: DebtToolContext, args: Args) {
  const [debts, segments] = await Promise.all([loadDebts(ctx), loadSegments(ctx)]);
  const strategy: Strategy =
    args.strategy === "avalanche"
      ? "avalanche"
      : args.strategy === "utilization"
        ? "utilization"
        : "snowball";
  const extra = numOf(args, "extra_per_month") ?? 0;
  const active = debts.filter((d) => debtPayoff(d, segments) > 0);
  if (active.length === 0) return { strategy, message: "No debts — nothing to plan." };

  // Honour extra payments already assigned to a paycheck, so this answers the
  // same as the app rather than re-deciding where the money goes.
  const { data: extras } = await ctx.supabase.from("snowball_payments").select("*");
  const scheduled = toScheduledExtras((extras ?? []) as SnowballPayment[]);

  const plan = simulatePayoff(active, extra, strategy, true, scheduled, segments);

  // A promo rate about to revert is the one deadline a payoff plan can't just
  // sort its way around, so it rides along with the plan — as a per-paycheck
  // amount, in the user's own pay cadence.
  const { data: sources } = await ctx.supabase
    .from("income_sources")
    .select("*")
    .eq("active", true);
  const ppm = paychecksPerMonth((sources ?? []) as IncomeSource[]);
  const deadlines = promoDeadlines(active, segments, ppm);

  return {
    strategy,
    extra_per_month: extra,
    monthly_outlay: plan.budget,
    months_to_debt_free: plan.capped ? null : plan.months,
    total_interest: plan.totalInterest,
    attack_order: orderedSnowballTargets(active, strategy, segments).map((t) =>
      t.name.trim()
    ),
    payoffs: plan.payoffs.map((p) => ({
      name: p.name.trim(),
      month: p.month,
      frees_per_month: p.freed,
      snowball_after: p.snowballAfter,
    })),
    utilization: (() => {
      const summary = utilizationSummary(active, segments, DEFAULT_UTILIZATION_TARGET);
      if (summary.cards.length === 0) return null;
      const perPaycheck = ppm > 0 ? extra / ppm : 0;
      return {
        target_percent: summary.target,
        aggregate_percent: summary.aggregatePercent,
        total_balance: summary.totalBalance,
        total_limit: summary.totalLimit,
        to_get_every_card_under_target: summary.allCardsToTarget,
        cards: summary.cards.map((c) => ({
          name: c.name,
          percent: c.percent,
          balance: c.balance,
          limit: c.limit,
          over_limit: c.overLimit,
          at_target: c.atTarget,
          to_reach_target: c.toTarget,
        })),
        // Cheapest score win first: an over-limit card back under the line,
        // then whole cards under the target, nearest first.
        steps: utilizationPlan(
          active,
          segments,
          DEFAULT_UTILIZATION_TARGET,
          perPaycheck
        ).map((s) => ({
          card: s.name,
          milestone: s.milestone,
          cost: s.milestoneCost,
          reached_by_paycheck: s.paychecks || null,
          aggregate_after: s.aggregateAfter,
        })),
      };
    })(),
    promo_deadlines: deadlines.map((d) => ({
      debt: d.debtName,
      balance: d.balance,
      apr_now: d.apr,
      apr_after: d.postPromoApr,
      ends_on: d.endsOn,
      expired: d.expired,
      paychecks_left: d.paychecksLeft,
      per_paycheck_to_clear_in_time: d.perPaycheck,
      yearly_cost_if_missed: d.costIfMissed,
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
    apr_manual: args.interest_rate != null,
    minimum_payment: numOf(args, "minimum_payment"),
    minimum_rule: str(args, "minimum_rule") as MinimumRule | undefined,
    minimum_percent: numOf(args, "minimum_percent"),
    minimum_floor: numOf(args, "minimum_floor"),
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
    apr_manual: args.interest_rate != null ? true : base.apr_manual,
    minimum_payment: numOf(args, "minimum_payment") ?? base.minimum_payment,
    minimum_rule: (str(args, "minimum_rule") as MinimumRule | undefined) ?? base.minimum_rule,
    minimum_percent: numOf(args, "minimum_percent") ?? base.minimum_percent,
    minimum_floor: numOf(args, "minimum_floor") ?? base.minimum_floor,
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
  get_debt: async (ctx, args) => {
    const [debt, segments] = await Promise.all([
      resolveDebt(ctx, String(args.debt)),
      loadSegments(ctx),
    ]);
    return { debt: describeDebt(debt, segments) };
  },
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
