-- BNPL early-payoff (settlement) amount: what it costs to clear the plan today,
-- which for interest-bearing BNPL is less than the sum of remaining installments
-- (the lender waives unearned future interest). Nullable; when set it's the
-- truest "what you owe" and what the snowball pays to settle the plan early.
alter table debts add column if not exists settlement_amount numeric(12, 2) check (settlement_amount >= 0);
