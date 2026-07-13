-- Paycheck Planner initial schema
-- Every table is scoped to auth.uid() via row level security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Income sources (jobs / recurring pay) and their pay schedule
-- ---------------------------------------------------------------------------
create type pay_frequency as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');

create table income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  frequency pay_frequency not null,
  -- anchor_date: a known pay date, used to project future occurrences for
  -- weekly / biweekly schedules.
  anchor_date date,
  -- semimonthly_days: two days of month, e.g. {1, 15}. monthly_day: single day of month.
  semimonthly_days smallint[],
  monthly_day smallint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index income_sources_user_id_idx on income_sources (user_id);

-- Itemized deductions per income source (taxes, benefits, 401k, etc.)
create type deduction_kind as enum ('pretax', 'tax', 'posttax');

create table paycheck_deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  income_source_id uuid not null references income_sources (id) on delete cascade,
  label text not null,
  kind deduction_kind not null default 'tax',
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index paycheck_deductions_income_source_id_idx on paycheck_deductions (income_source_id);

-- ---------------------------------------------------------------------------
-- Bills / recurring expenses
-- ---------------------------------------------------------------------------
create type bill_frequency as enum ('weekly', 'biweekly', 'monthly', 'yearly', 'one_time');

create table bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  category text not null default 'other',
  frequency bill_frequency not null default 'monthly',
  due_day smallint, -- day of month for monthly/yearly bills
  due_date date, -- specific date for one_time bills, or anchor for weekly/biweekly
  autopay boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index bills_user_id_idx on bills (user_id);

-- Assigns a bill's occurrence to a specific paycheck occurrence so users can
-- see what each paycheck needs to cover.
create table bill_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bill_id uuid not null references bills (id) on delete cascade,
  income_source_id uuid not null references income_sources (id) on delete cascade,
  paycheck_date date not null,
  bill_due_date date not null,
  created_at timestamptz not null default now(),
  unique (bill_id, bill_due_date)
);

create index bill_allocations_user_id_idx on bill_allocations (user_id);
create index bill_allocations_paycheck_idx on bill_allocations (income_source_id, paycheck_date);

-- ---------------------------------------------------------------------------
-- Savings goals
-- ---------------------------------------------------------------------------
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount >= 0),
  current_amount numeric(12, 2) not null default 0 check (current_amount >= 0),
  target_date date,
  monthly_contribution numeric(12, 2),
  created_at timestamptz not null default now()
);

create index savings_goals_user_id_idx on savings_goals (user_id);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references savings_goals (id) on delete cascade,
  amount numeric(12, 2) not null,
  contributed_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index goal_contributions_goal_id_idx on goal_contributions (goal_id);

-- ---------------------------------------------------------------------------
-- Debts
-- ---------------------------------------------------------------------------
create type debt_type as enum ('credit_card', 'student_loan', 'auto_loan', 'personal_loan', 'mortgage', 'medical', 'other');

create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type debt_type not null default 'other',
  balance numeric(12, 2) not null check (balance >= 0),
  interest_rate numeric(5, 2) not null default 0,
  minimum_payment numeric(12, 2) not null default 0,
  due_day smallint,
  created_at timestamptz not null default now()
);

create index debts_user_id_idx on debts (user_id);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index debt_payments_debt_id_idx on debt_payments (debt_id);

-- ---------------------------------------------------------------------------
-- Row level security: every table is private to its owning user.
-- ---------------------------------------------------------------------------
alter table income_sources enable row level security;
alter table paycheck_deductions enable row level security;
alter table bills enable row level security;
alter table bill_allocations enable row level security;
alter table savings_goals enable row level security;
alter table goal_contributions enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'income_sources', 'paycheck_deductions', 'bills', 'bill_allocations',
    'savings_goals', 'goal_contributions', 'debts', 'debt_payments'
  ]
  loop
    execute format(
      'create policy "%1$s_owner_select" on %1$s for select using (auth.uid() = user_id)', t
    );
    execute format(
      'create policy "%1$s_owner_insert" on %1$s for insert with check (auth.uid() = user_id)', t
    );
    execute format(
      'create policy "%1$s_owner_update" on %1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t
    );
    execute format(
      'create policy "%1$s_owner_delete" on %1$s for delete using (auth.uid() = user_id)', t
    );
  end loop;
end $$;
