import type { Debt, DebtSegment, SegmentKind } from "../supabase/types";
import { sum } from "../calc/money";

/**
 * A card is rarely one balance at one rate. Segments let a card carry a 0%
 * balance transfer alongside purchases at the go-to APR, which changes three
 * things no averaged rate can express: what the card actually costs, where the
 * next dollar should go, and when cheap money turns expensive.
 *
 * Every calculation reads a card through `debtParts` rather than reaching for
 * `balance` and `interest_rate` directly, so a card with segments and a card
 * without are the same shape downstream and neither can drift from the other.
 */

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  purchase: "Purchases",
  balance_transfer: "Balance transfer",
  cash_advance: "Cash advance",
};

/** One balance bucket, normalized. Cards without segments produce exactly one. */
export interface DebtPart {
  id: string;
  kind: SegmentKind;
  balance: number;
  apr: number;
  /** Null unless the rate is promotional and expires. */
  promoEndsOn: string | null;
  postPromoApr: number | null;
}

export function segmentsFor(debtId: string, segments: DebtSegment[]): DebtSegment[] {
  return segments
    .filter((s) => s.debt_id === debtId)
    .sort((a, b) => a.position - b.position);
}

/**
 * The card's balance buckets. A card with no segments is treated as a single
 * bucket at its own balance and APR, so nothing downstream needs to branch on
 * whether segments have been set up.
 */
export function debtParts(debt: Debt, segments: DebtSegment[]): DebtPart[] {
  const own = segmentsFor(debt.id, segments);
  if (own.length === 0) {
    return [
      {
        id: debt.id,
        kind: "purchase",
        balance: debt.balance,
        apr: debt.interest_rate,
        promoEndsOn: null,
        postPromoApr: null,
      },
    ];
  }
  return own.map((s) => ({
    id: s.id,
    kind: s.kind,
    balance: s.balance,
    apr: s.apr,
    promoEndsOn: s.promo_ends_on,
    postPromoApr: s.post_promo_apr,
  }));
}

export function hasSegments(debt: Debt, segments: DebtSegment[]): boolean {
  return segments.some((s) => s.debt_id === debt.id);
}

/**
 * The rate in force on a given date. A promo that has already lapsed is worth
 * nothing, so an expired segment reports the rate it reverted to — including
 * for a date in the past, which keeps today's view and the projection agreeing.
 */
export function aprOn(part: DebtPart, on: Date): number {
  if (!part.promoEndsOn || part.postPromoApr == null) return part.apr;
  const [y, m, d] = part.promoEndsOn.split("-").map(Number);
  const ends = new Date(y, m - 1, d);
  return on > ends ? part.postPromoApr : part.apr;
}

/** Total owed on the card. */
export function cardBalance(debt: Debt, segments: DebtSegment[]): number {
  return round2(sum(debtParts(debt, segments).map((p) => p.balance)));
}

/**
 * Balance-weighted APR — what the card costs per dollar as a whole. This is the
 * number to *show*; it is not the number to rank by, because the next dollar
 * paid doesn't go to the average (see `marginalApr`).
 */
export function cardApr(debt: Debt, segments: DebtSegment[], on = new Date()): number {
  const parts = debtParts(debt, segments).filter((p) => p.balance > 0);
  const total = sum(parts.map((p) => p.balance));
  if (total <= 0) return debt.interest_rate;
  return round2(sum(parts.map((p) => p.balance * aprOn(p, on))) / total);
}

/**
 * The rate the *next* dollar of extra payment avoids. Federal law sends
 * above-minimum payments to the highest-APR balance first, so a card holding
 * 0% transfer money and 24% purchases is, at the margin, a 24% card. Avalanche
 * ordering has to use this or it will rank that card behind a flat 20% one and
 * send the money to the wrong place.
 */
export function marginalApr(debt: Debt, segments: DebtSegment[], on = new Date()): number {
  const rates = debtParts(debt, segments)
    .filter((p) => p.balance > 0)
    .map((p) => aprOn(p, on));
  return rates.length === 0 ? debt.interest_rate : Math.max(...rates);
}

/**
 * Applies a payment across a card's buckets and returns what's left over.
 *
 * `order` reflects who decides where the money lands. The card issuer allocates
 * the *minimum* payment, and does it to the cheapest balance first — which is
 * why a 0% transfer can sit untouched for a year while purchases compound.
 * Anything above the minimum is the cardholder's, and Reg Z §1026.53 requires
 * the issuer to apply it to the highest rate first.
 */
export function applyToParts(
  parts: DebtPart[],
  amount: number,
  order: "cheapest_first" | "costliest_first",
  on: Date
): number {
  let left = amount;
  const queue = parts
    .filter((p) => p.balance > 0.005)
    .sort((a, b) =>
      order === "cheapest_first"
        ? aprOn(a, on) - aprOn(b, on)
        : aprOn(b, on) - aprOn(a, on)
    );
  for (const part of queue) {
    if (left <= 0.005) break;
    const paid = Math.min(left, part.balance);
    part.balance -= paid;
    left -= paid;
    if (part.balance <= 0.005) part.balance = 0;
  }
  return left;
}

// ---------------------------------------------------------------------------
// Promo deadlines. A 0% transfer is only a deal if it's gone before the rate
// reverts, and "gone by March" means nothing until it's a number on a paycheck.
// ---------------------------------------------------------------------------

export interface PromoDeadline {
  debtId: string;
  debtName: string;
  segmentId: string;
  kind: SegmentKind;
  balance: number;
  apr: number;
  postPromoApr: number;
  endsOn: string;
  /** Paychecks left before the rate reverts. 0 = it reverts before the next one. */
  paychecksLeft: number;
  /** Per paycheck to clear this balance by the deadline. */
  perPaycheck: number;
  /** Yearly cost if the balance is still sitting there when the promo ends. */
  costIfMissed: number;
  expired: boolean;
}

/**
 * Every promotional balance that still has money on it, expressed as the
 * per-paycheck contribution that clears it in time.
 *
 * `paychecksPerMonth` comes from the user's real income schedule, so the answer
 * is in their pay cadence rather than in months.
 */
export function promoDeadlines(
  debts: Debt[],
  segments: DebtSegment[],
  paychecksPerMonth: number,
  today = new Date()
): PromoDeadline[] {
  const daysPerPaycheck = paychecksPerMonth > 0 ? 365 / (paychecksPerMonth * 12) : 0;
  const out: PromoDeadline[] = [];

  for (const debt of debts) {
    for (const segment of segmentsFor(debt.id, segments)) {
      if (!segment.promo_ends_on || segment.post_promo_apr == null) continue;
      if (segment.balance <= 0) continue;

      const [y, m, d] = segment.promo_ends_on.split("-").map(Number);
      const ends = new Date(y, m - 1, d);
      const days = Math.ceil((ends.getTime() - today.getTime()) / 86_400_000);
      const expired = days < 0;
      const paychecksLeft =
        expired || daysPerPaycheck === 0 ? 0 : Math.floor(days / daysPerPaycheck);

      out.push({
        debtId: debt.id,
        debtName: debt.name.trim(),
        segmentId: segment.id,
        kind: segment.kind,
        balance: segment.balance,
        apr: segment.apr,
        postPromoApr: segment.post_promo_apr,
        endsOn: segment.promo_ends_on,
        paychecksLeft,
        // With no paycheck left before the deadline the whole balance is due
        // now — reporting an infinite per-paycheck figure would help no one.
        perPaycheck: round2(paychecksLeft > 0 ? segment.balance / paychecksLeft : segment.balance),
        costIfMissed: round2((segment.balance * segment.post_promo_apr) / 100),
        expired,
      });
    }
  }

  return out.sort((a, b) => a.endsOn.localeCompare(b.endsOn));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
