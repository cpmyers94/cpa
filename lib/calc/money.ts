export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Formats a `yyyy-mm-dd` calendar date for display without a timezone shift.
 * `new Date("2026-07-23")` parses as UTC midnight, so `toLocaleDateString` in a
 * negative-offset timezone renders the day before (7/22). Parsing the parts
 * into a local-midnight Date keeps the calendar day intact everywhere.
 */
export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, options);
}

/** Months to pay off a balance given a fixed monthly payment and APR. Returns null if payment never covers interest. */
export function monthsToPayoff(balance: number, apr: number, monthlyPayment: number): number | null {
  if (monthlyPayment <= 0 || balance <= 0) return balance <= 0 ? 0 : null;
  const monthlyRate = apr / 100 / 12;
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment);
  if (monthlyPayment <= balance * monthlyRate) return null;

  const months =
    -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
}

export function totalInterestPaid(balance: number, apr: number, monthlyPayment: number): number | null {
  const months = monthsToPayoff(balance, apr, monthlyPayment);
  if (months === null) return null;
  return Math.max(months * monthlyPayment - balance, 0);
}
