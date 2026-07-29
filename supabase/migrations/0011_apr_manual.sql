-- Marks an APR as user-owned. A BNPL plan's rate can be derived from the
-- lender's payoff figure, but a rate the user typed in is authoritative and
-- must never be overwritten by that derivation (or by any bulk backfill).
-- False means "we worked this out"; true means "the user set this".
alter table debts add column if not exists apr_manual boolean not null default false;

-- Rates entered on cards and loans have always come from the user.
update debts set apr_manual = true where type <> 'bnpl' and interest_rate > 0;
