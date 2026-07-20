-- North-star: everything needs a paycheck amount. A savings bucket/goal now
-- carries a per-paycheck contribution (what each paycheck sets aside) rather
-- than a monthly figure, so it shows up as its own line on the paycheck it
-- comes out of. Replaces the old monthly_contribution.
alter table savings_goals drop column if exists monthly_contribution;
alter table savings_goals add column if not exists per_paycheck_contribution numeric(12, 2);
