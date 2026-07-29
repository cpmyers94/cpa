/**
 * BNPL plans are installment loans, so their numbers follow loan math rather
 * than the "interest is baked in, treat it as 0%" shortcut the app used at
 * first. Two consequences:
 *
 *  - The payoff-today amount is the present value of the remaining payments.
 *    Given the installment, how many are left, and the APR, it can be computed
 *    instead of copied from the lender every time it changes.
 *  - The APR is real and often 25–35%, which is higher than most credit cards.
 *    Treating these as 0% made avalanche rank them last, exactly backwards.
 */

/**
 * Payoff today for an installment loan: the present value of the remaining
 * payments, discounted at the loan's own rate. This is what the lender means by
 * "remaining balance" — the scheduled total minus the interest you skip by not
 * riding the schedule out. At 0% it's just the payments added up.
 */
export function bnplPayoff(installment: number, paymentsRemaining: number, apr: number): number {
  const n = Math.max(Math.floor(paymentsRemaining), 0);
  if (installment <= 0 || n === 0) return 0;
  const i = apr / 100 / 12;
  if (i <= 0) return round2(installment * n);
  return round2((installment * (1 - Math.pow(1 + i, -n))) / i);
}

/**
 * The APR implied by a lender's payoff figure — the rate at which the remaining
 * payments discount to exactly that amount. Useful for turning a number copied
 * out of the lender's app into a rate the plan can reason about, and for
 * sanity-checking it: a plan that implies 50%+ is worth a second look.
 *
 * Returns 0 when the payoff isn't discounted at all, and null when no rate
 * explains it (the payoff is below what any rate would give).
 */
export function impliedBnplApr(
  installment: number,
  paymentsRemaining: number,
  payoff: number
): number | null {
  const n = Math.max(Math.floor(paymentsRemaining), 0);
  if (installment <= 0 || n === 0 || payoff <= 0) return null;
  const scheduled = installment * n;
  if (payoff >= scheduled - 0.005) return 0;

  // Present value falls as the rate rises, so bisect on the monthly rate.
  let lo = 0;
  let hi = 1; // 100% per month — far beyond any real plan
  if (bnplPayoff(installment, n, hi * 12 * 100) > payoff) return null;
  for (let step = 0; step < 80; step += 1) {
    const mid = (lo + hi) / 2;
    if (pv(installment, n, mid) > payoff) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 100 * 10) / 10;
}

function pv(installment: number, n: number, monthlyRate: number): number {
  if (monthlyRate <= 0) return installment * n;
  return (installment * (1 - Math.pow(1 + monthlyRate, -n))) / monthlyRate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
