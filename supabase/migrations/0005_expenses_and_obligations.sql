-- Expenses + generalized paycheck obligations.
--
-- 1. Expenses: monthly budget categories. An expense with a `due_day` set is a
--    dated (subscription-style) charge that also participates in paycheck
--    planning; without a due_day it's a pure monthly budget line that only
--    feeds cash-flow / the payoff plan.
-- 2. Allocations generalize from bills-only to any obligation (bill, debt
--    payment, or dated expense). We keep the `bill_allocations` table and add
--    `debt_id` / `expense_id` alongside the existing `bill_id` — exactly one is
--    set per row — so existing rows and RLS/household plumbing stay intact.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount >= 0), -- budgeted per month
  category text not null default 'other',
  is_subscription boolean not null default false,
  due_day smallint, -- set => dated monthly charge, enters paycheck planning
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on expenses (user_id);
create index if not exists expenses_household_id_idx on expenses (household_id);

alter table expenses enable row level security;

drop trigger if exists set_household_id on expenses;
create trigger set_household_id before insert on expenses
  for each row execute function public.set_household_id();

drop policy if exists "expenses_hh_select" on expenses;
drop policy if exists "expenses_hh_insert" on expenses;
drop policy if exists "expenses_hh_update" on expenses;
drop policy if exists "expenses_hh_delete" on expenses;
create policy "expenses_hh_select" on expenses
  for select using (public.is_household_member(household_id));
create policy "expenses_hh_insert" on expenses
  for insert with check (public.is_household_member(household_id) and user_id = auth.uid());
create policy "expenses_hh_update" on expenses
  for update using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  ) with check (public.is_household_member(household_id));
create policy "expenses_hh_delete" on expenses
  for delete using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  );

-- ---------------------------------------------------------------------------
-- Generalize allocations: a row now covers a bill, a debt payment, or a dated
-- expense. `bill_due_date` is reused as the generic occurrence date.
-- ---------------------------------------------------------------------------
alter table bill_allocations
  add column if not exists debt_id uuid references debts (id) on delete cascade,
  add column if not exists expense_id uuid references expenses (id) on delete cascade;

alter table bill_allocations alter column bill_id drop not null;

alter table bill_allocations drop constraint if exists bill_allocations_one_obligation;
alter table bill_allocations
  add constraint bill_allocations_one_obligation
  check (num_nonnulls(bill_id, debt_id, expense_id) = 1);

create unique index if not exists bill_allocations_debt_occ_idx
  on bill_allocations (debt_id, bill_due_date) where debt_id is not null;
create unique index if not exists bill_allocations_expense_occ_idx
  on bill_allocations (expense_id, bill_due_date) where expense_id is not null;
create index if not exists bill_allocations_debt_idx on bill_allocations (debt_id);
create index if not exists bill_allocations_expense_idx on bill_allocations (expense_id);

-- ---------------------------------------------------------------------------
-- Household join/leave must also move the user's expenses. (bill_allocations
-- already moves; its rows reference obligations that move with the same user.)
-- ---------------------------------------------------------------------------
create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  old uuid;
  t text;
begin
  select id into target from public.households where invite_code = upper(trim(p_code));
  if target is null then
    raise exception 'Invalid invite code';
  end if;
  old := public.current_household_id();
  if old = target then
    return target;
  end if;
  foreach t in array array[
    'income_sources', 'paycheck_deductions', 'bills', 'bill_allocations',
    'savings_goals', 'goal_contributions', 'debts', 'debt_payments', 'expenses'
  ]
  loop
    execute format('update public.%I set household_id = $1 where user_id = $2', t)
      using target, auth.uid();
  end loop;
  update public.household_members set household_id = target, role = 'member'
    where user_id = auth.uid();
  if old is not null
    and not exists (select 1 from public.household_members where household_id = old) then
    delete from public.households where id = old;
  end if;
  return target;
end $$;

create or replace function public.leave_household()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  old uuid;
  newh uuid;
  t text;
begin
  old := public.current_household_id();
  insert into public.households (name, invite_code)
    values ('My Household', public.gen_invite_code())
    returning id into newh;
  foreach t in array array[
    'income_sources', 'paycheck_deductions', 'bills', 'bill_allocations',
    'savings_goals', 'goal_contributions', 'debts', 'debt_payments', 'expenses'
  ]
  loop
    execute format('update public.%I set household_id = $1 where user_id = $2', t)
      using newh, auth.uid();
  end loop;
  update public.household_members set household_id = newh, role = 'owner'
    where user_id = auth.uid();
  if old is not null then
    if exists (select 1 from public.household_members where household_id = old) then
      if not exists (
        select 1 from public.household_members where household_id = old and role = 'owner'
      ) then
        update public.household_members set role = 'owner'
          where household_id = old
            and user_id = (
              select user_id from public.household_members
              where household_id = old order by joined_at limit 1
            );
      end if;
    else
      delete from public.households where id = old;
    end if;
  end if;
  return newh;
end $$;
