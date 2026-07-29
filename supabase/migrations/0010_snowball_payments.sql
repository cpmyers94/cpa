-- Explicit extra debt payments ("snowball payments") assigned to a specific
-- paycheck. Replaces the old behaviour of silently applying a recommended
-- snowball to every paycheck: real life is a lump payment on the paycheck that
-- can absorb it, not a fixed slice of each one. The app still recommends which
-- paycheck to use; nothing is subtracted until it's assigned here.
create table if not exists snowball_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  income_source_id uuid not null references income_sources (id) on delete cascade,
  paycheck_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists snowball_payments_paycheck_idx
  on snowball_payments (income_source_id, paycheck_date);

alter table snowball_payments enable row level security;

drop trigger if exists set_household_id on snowball_payments;
create trigger set_household_id before insert on snowball_payments
  for each row execute function public.set_household_id();

-- Same posture as the other data tables: read across the household, write your
-- own rows (or anyone's when the household allows shared editing).
create policy snowball_payments_hh_select on snowball_payments
  for select using (public.is_household_member(household_id));
create policy snowball_payments_hh_insert on snowball_payments
  for insert with check (
    public.is_household_member(household_id) and user_id = auth.uid()
  );
create policy snowball_payments_hh_update on snowball_payments
  for update using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  ) with check (public.is_household_member(household_id));
create policy snowball_payments_hh_delete on snowball_payments
  for delete using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  );
