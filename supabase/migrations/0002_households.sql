-- Households: let multiple people share one consolidated budget.
--
-- Model
--   * Every user belongs to exactly one household (enforced by a unique
--     constraint on household_members.user_id). On first load a personal
--     household is created for them.
--   * Every data row carries both a `user_id` (who authored it) and a
--     `household_id` (which shared budget it belongs to). Visibility is scoped
--     to the household; editing is governed by the household's `shared_editing`
--     flag (owner-controlled): when true anyone in the household can edit any
--     row, when false each person can only edit rows they authored.
--   * Joining another household via its invite code moves your authored rows
--     into it; leaving moves them back out into a fresh personal household.

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  invite_code text not null unique,
  shared_editing boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- a user is in exactly one household at a time
);

-- Lightweight mirror of auth.users so household members can see each other's
-- names for attribution (auth.users is not directly readable by clients).
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

alter table households enable row level security;
alter table household_members enable row level security;
alter table profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can inspect membership without
-- being blocked by / recursing through row level security).
-- ---------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid language sql security definer stable set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.household_shared_editing(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select shared_editing from public.households where id = hid;
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.gen_invite_code()
returns text language plpgsql set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no ambiguous 0/O/1/I/L
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end $$;

-- Populates household_id / user_id on insert so client mutations don't have to.
create or replace function public.set_household_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.household_id is null then
    new.household_id := public.current_household_id();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Add household_id to every data table, wire up the insert trigger, and
-- replace the per-user RLS policies with household-scoped ones.
-- ---------------------------------------------------------------------------
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
      'alter table public.%I add column if not exists household_id uuid references public.households (id) on delete cascade',
      t
    );
    execute format(
      'create index if not exists %I on public.%I (household_id)',
      t || '_household_id_idx', t
    );

    execute format('drop trigger if exists set_household_id on public.%I', t);
    execute format(
      'create trigger set_household_id before insert on public.%I for each row execute function public.set_household_id()',
      t
    );

    -- Drop the original owner-only policies from migration 0001.
    execute format('drop policy if exists "%1$s_owner_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_owner_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_owner_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_owner_delete" on public.%1$s', t);

    -- Household-scoped policies: everyone in the household can read; editing
    -- depends on authorship or the household's shared_editing flag.
    execute format(
      'create policy "%1$s_hh_select" on public.%1$s for select using (public.is_household_member(household_id))',
      t
    );
    execute format(
      'create policy "%1$s_hh_insert" on public.%1$s for insert with check (public.is_household_member(household_id) and user_id = auth.uid())',
      t
    );
    execute format(
      'create policy "%1$s_hh_update" on public.%1$s for update using (public.is_household_member(household_id) and (user_id = auth.uid() or public.household_shared_editing(household_id))) with check (public.is_household_member(household_id))',
      t
    );
    execute format(
      'create policy "%1$s_hh_delete" on public.%1$s for delete using (public.is_household_member(household_id) and (user_id = auth.uid() or public.household_shared_editing(household_id)))',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS for the household tables themselves.
-- ---------------------------------------------------------------------------
drop policy if exists households_select on households;
drop policy if exists households_update on households;
create policy households_select on households
  for select using (public.is_household_member(id));
create policy households_update on households
  for update using (public.is_household_owner(id)) with check (public.is_household_owner(id));

drop policy if exists household_members_select on household_members;
create policy household_members_select on household_members
  for select using (public.is_household_member(household_id));

drop policy if exists profiles_select on profiles;
drop policy if exists profiles_update on profiles;
create policy profiles_select on profiles
  for select using (id = auth.uid() or public.shares_household_with(id));
create policy profiles_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs for membership operations (privileged / multi-step work).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_household()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  em text := auth.jwt() ->> 'email';
begin
  select household_id into hid from public.household_members where user_id = auth.uid();

  insert into public.profiles (id, email, display_name)
    values (auth.uid(), em, split_part(coalesce(em, ''), '@', 1))
    on conflict (id) do update set email = excluded.email
      where public.profiles.email is distinct from excluded.email;

  if hid is not null then
    return hid;
  end if;

  insert into public.households (name, invite_code)
    values ('My Household', public.gen_invite_code())
    returning id into hid;
  insert into public.household_members (household_id, user_id, role)
    values (hid, auth.uid(), 'owner');
  return hid;
end $$;

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
    'savings_goals', 'goal_contributions', 'debts', 'debt_payments'
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
    'savings_goals', 'goal_contributions', 'debts', 'debt_payments'
  ]
  loop
    execute format('update public.%I set household_id = $1 where user_id = $2', t)
      using newh, auth.uid();
  end loop;

  update public.household_members set household_id = newh, role = 'owner'
    where user_id = auth.uid();

  if old is not null then
    if exists (select 1 from public.household_members where household_id = old) then
      -- Make sure the household we left still has an owner.
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

create or replace function public.regenerate_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
  hid uuid;
begin
  hid := public.current_household_id();
  if not public.is_household_owner(hid) then
    raise exception 'Only the household owner can regenerate the invite code';
  end if;
  c := public.gen_invite_code();
  update public.households set invite_code = c where id = hid;
  return c;
end $$;

grant execute on function public.ensure_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.regenerate_invite_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: give every existing user a personal household and attach their
-- existing rows to it. (No-op on a fresh database.)
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
  hid uuid;
  t text;
begin
  for u in select id, email from auth.users loop
    if not exists (select 1 from public.household_members where user_id = u.id) then
      insert into public.households (name, invite_code)
        values ('My Household', public.gen_invite_code())
        returning id into hid;
      insert into public.household_members (household_id, user_id, role)
        values (hid, u.id, 'owner');
      insert into public.profiles (id, email, display_name)
        values (u.id, u.email, split_part(coalesce(u.email, ''), '@', 1))
        on conflict (id) do nothing;

      foreach t in array array[
        'income_sources', 'paycheck_deductions', 'bills', 'bill_allocations',
        'savings_goals', 'goal_contributions', 'debts', 'debt_payments'
      ]
      loop
        execute format('update public.%I set household_id = $1 where user_id = $2 and household_id is null', t)
          using hid, u.id;
      end loop;
    end if;
  end loop;
end $$;
