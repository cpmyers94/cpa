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
