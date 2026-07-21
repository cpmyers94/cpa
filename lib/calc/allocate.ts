export type PaycheckChoice = { incomeSourceId: string; date: string };

/**
 * Picks the paycheck that should cover a bill due on `dueDate`: the latest
 * paycheck landing on or before the due date (the nearest payday before the
 * bill is due). Dates are ISO `yyyy-mm-dd` strings, so lexical comparison is
 * chronological. Returns null when no paycheck falls on or before the due date
 * — in that case the bill is left unassigned rather than covered by money that
 * arrives too late.
 */
export function pickPaycheckForDueDate<T extends PaycheckChoice>(
  paychecks: T[],
  dueDate: string
): T | null {
  let best: T | null = null;
  for (const paycheck of paychecks) {
    if (paycheck.date > dueDate) continue;
    if (!best || paycheck.date > best.date) best = paycheck;
  }
  return best;
}

function isoToDays(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000);
}

/**
 * Snaps a stored paycheck date to the nearest actual paycheck occurrence so an
 * assignment survives a schedule shift (e.g. "I now get paid a day later" moves
 * every payday, which would otherwise orphan every allocation pinned to the old
 * dates). Returns the nearest occurrence only when it's unambiguously the same
 * payday — within half the pay period — otherwise null, meaning the stored date
 * no longer maps to a real paycheck and the assignment should be dropped.
 */
export function snapToOccurrence(date: string, occurrences: string[]): string | null {
  if (occurrences.length === 0) return null;
  const target = isoToDays(date);

  let best = occurrences[0];
  let bestDelta = Math.abs(isoToDays(best) - target);
  for (const occ of occurrences) {
    const delta = Math.abs(isoToDays(occ) - target);
    if (delta < bestDelta) {
      best = occ;
      bestDelta = delta;
    }
  }

  const sorted = occurrences.map(isoToDays).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i += 1) minGap = Math.min(minGap, sorted[i] - sorted[i - 1]);
  const tolerance = Number.isFinite(minGap) ? minGap / 2 : 7;

  return bestDelta <= tolerance ? best : null;
}
