-- BNPL (buy-now-pay-later) debts: fixed installments on a fixed schedule,
-- with any financing cost baked into the payments — no APR, no revolving
-- balance. Modeled as installment_amount × payments_remaining at a cadence.
alter type debt_type add value if not exists 'bnpl';

alter table debts
  add column if not exists installment_amount numeric(12, 2),
  add column if not exists payments_remaining smallint,
  add column if not exists installment_frequency text
    check (installment_frequency in ('weekly', 'biweekly', 'monthly')),
  add column if not exists next_payment_date date;
