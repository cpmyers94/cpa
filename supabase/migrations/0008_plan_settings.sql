-- Shared payoff-plan settings: the chosen strategy and snowball override live
-- per household so every page (Plan, Safe to Spend) works from the same plan
-- and the snowball can be assigned to paychecks everywhere. One row per
-- household; any member can read or set it (a payoff plan is a household
-- decision, not an authored entry).
create table if not exists plan_settings (
  household_id uuid primary key references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy text not null default 'snowball' check (strategy in ('avalanche', 'snowball')),
  extra_override numeric(12, 2) check (extra_override >= 0),
  updated_at timestamptz not null default now()
);

alter table plan_settings enable row level security;

create policy plan_settings_select on plan_settings
  for select using (public.is_household_member(household_id));
create policy plan_settings_insert on plan_settings
  for insert with check (public.is_household_member(household_id) and user_id = auth.uid());
create policy plan_settings_update on plan_settings
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy plan_settings_delete on plan_settings
  for delete using (public.is_household_member(household_id));
