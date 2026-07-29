import type { CardStructure, DebtSegment, SegmentKind } from "../supabase/types";
import { sum } from "../calc/money";

/**
 * The write side of card segments. The form asks one question — how is this
 * card carrying a balance — and that answer expands into the segment rows plus
 * the derived card-level balance and APR. Doing that expansion here means the
 * web form and the AI tool layer can't disagree about what a "balance transfer
 * with purchases" card looks like in the database.
 */

export interface SegmentInput {
  kind: SegmentKind;
  balance: number;
  apr: number;
  promo_ends_on?: string | null;
  post_promo_apr?: number | null;
}

export interface SegmentRow extends SegmentInput {
  promo_ends_on: string | null;
  post_promo_apr: number | null;
  position: number;
}

export const STRUCTURES: { value: CardStructure; label: string; hint: string }[] = [
  {
    value: "simple",
    label: "One balance",
    hint: "Everything on the card is at the same rate.",
  },
  {
    value: "transfer",
    label: "Balance transfer",
    hint: "A transferred balance, usually at a promo rate that expires.",
  },
  {
    value: "transfer_and_purchases",
    label: "Transfer + purchases",
    hint: "A transferred balance plus newer spending at the regular APR.",
  },
];

/** Which structure a card's existing segments represent. */
export function structureOf(segments: DebtSegment[]): CardStructure {
  const kinds = new Set(segments.map((s) => s.kind));
  if (!kinds.has("balance_transfer")) return "simple";
  return kinds.has("purchase") ? "transfer_and_purchases" : "transfer";
}

/**
 * Builds the segment rows for a card. `simple` returns none — a card at one
 * rate doesn't need buckets, and leaving it unsegmented keeps its stored
 * balance authoritative rather than shadowed by a single redundant row.
 */
export function buildSegments(
  structure: CardStructure,
  input: {
    transferBalance?: number | null;
    transferApr?: number | null;
    promoEndsOn?: string | null;
    postPromoApr?: number | null;
    purchaseBalance?: number | null;
    purchaseApr?: number | null;
  }
): SegmentRow[] {
  if (structure === "simple") return [];

  const promoEnds = input.promoEndsOn || null;
  const rows: SegmentRow[] = [
    {
      kind: "balance_transfer",
      balance: num(input.transferBalance),
      apr: num(input.transferApr),
      promo_ends_on: promoEnds,
      // A promo rate with no stated revert rate is still a promo; assume it
      // returns to the card's purchase APR, which is what issuers do.
      post_promo_apr: promoEnds
        ? num(input.postPromoApr) || num(input.purchaseApr) || null
        : null,
      position: 0,
    },
  ];

  if (structure === "transfer_and_purchases") {
    rows.push({
      kind: "purchase",
      balance: num(input.purchaseBalance),
      apr: num(input.purchaseApr),
      promo_ends_on: null,
      post_promo_apr: null,
      position: 1,
    });
  }

  // A promo end date with nothing to revert to trips the database constraint,
  // and would be a half-told story anyway.
  return rows.map((r) =>
    r.promo_ends_on && r.post_promo_apr == null
      ? { ...r, promo_ends_on: null, post_promo_apr: null }
      : r
  );
}

/**
 * The card-level balance and APR implied by its segments. These columns stay
 * populated so anything reading a debt without segment context still sees a
 * true total, and every writer derives them the same way.
 */
export function derivedCardTotals(rows: SegmentRow[]): {
  balance: number;
  interest_rate: number;
} {
  const balance = round2(sum(rows.map((r) => r.balance)));
  if (balance <= 0) return { balance, interest_rate: 0 };
  return {
    balance,
    interest_rate: round2(sum(rows.map((r) => r.balance * r.apr)) / balance),
  };
}

function num(v: number | null | undefined): number {
  return v == null || Number.isNaN(Number(v)) ? 0 : Number(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
