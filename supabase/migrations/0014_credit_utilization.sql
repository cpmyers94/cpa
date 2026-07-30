-- Credit utilization — balance against limit — is the largest part of a credit
-- score that can be changed quickly, because it carries no history: it's
-- recomputed from whatever the card reports each cycle, so paying a balance
-- down shows up in weeks rather than years.
--
-- Without the limit stored, the app can see a $3,868 balance but not that it
-- sits on a $4,000 line, which is the difference between "a debt" and "a card
-- reporting 97% used".
alter table debts add column if not exists credit_limit numeric(12, 2)
  check (credit_limit is null or credit_limit > 0);

-- A third payoff mode alongside avalanche and snowball: pay each card down
-- under a utilization target first. It costs more interest than avalanche, and
-- it's the right trade when a better score is what unlocks a cheaper rate.
alter table plan_settings drop constraint if exists plan_settings_strategy_check;
alter table plan_settings add constraint plan_settings_strategy_check
  check (strategy in ('avalanche', 'snowball', 'utilization'));

-- The utilization target to aim for, as a percentage. 30 is the common rule of
-- thumb; lower scores better, so this is a dial rather than a constant.
alter table plan_settings add column if not exists utilization_target numeric(5, 2)
  not null default 30 check (utilization_target > 0 and utilization_target <= 100);
