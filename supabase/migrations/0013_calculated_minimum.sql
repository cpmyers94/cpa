-- A credit card minimum isn't a number you choose, it's a formula the issuer
-- applies to whatever the balance is that month — typically a small percentage
-- of the balance plus the interest accrued, with a floor.
--
-- Typing it in once makes it wrong twice over: it doesn't fall as the balance
-- falls, and on a card with a 0% promo it doesn't jump when the promo lapses
-- and the whole balance starts accruing. Both matter for what a paycheck has
-- to cover, so the minimum can now be calculated instead.
alter table debts
  add column if not exists minimum_rule text not null default 'manual'
    check (minimum_rule in ('manual', 'percent_plus_interest', 'percent_of_balance')),
  add column if not exists minimum_percent numeric(5, 2),
  add column if not exists minimum_floor numeric(12, 2);
