-- A credit card is rarely one balance at one rate. A promotional balance
-- transfer sits at 0% until a deadline, purchases accrue at the go-to APR from
-- day one, and a cash advance is worse than both. Averaging them into a single
-- rate hides the only thing that matters: which dollars are expensive, and
-- which cheap ones are about to become expensive.
--
-- Each segment carries its own balance and rate. A card with no segments keeps
-- behaving exactly as before (one balance, one APR); where segments exist they
-- are the source of truth and debts.balance / debts.interest_rate are derived
-- from them, so no calculation can read a stale card-level number.
create table if not exists debt_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'balance_transfer', 'cash_advance')),
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  -- The rate charged on this segment right now. For a promo that is the promo
  -- rate, and post_promo_apr is what it becomes after promo_ends_on.
  apr numeric(5, 2) not null default 0 check (apr >= 0),
  promo_ends_on date,
  post_promo_apr numeric(5, 2) check (post_promo_apr >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- A promo without its expiry date is the dangerous half of the story.
  constraint promo_needs_both check (
    (promo_ends_on is null and post_promo_apr is null)
    or (promo_ends_on is not null and post_promo_apr is not null)
  )
);

create index if not exists debt_segments_debt_idx on debt_segments (debt_id, position);

alter table debt_segments enable row level security;

drop trigger if exists set_household_id on debt_segments;
create trigger set_household_id before insert on debt_segments
  for each row execute function public.set_household_id();

-- Same posture as the other data tables: read across the household, write your
-- own rows (or anyone's when the household allows shared editing).
create policy debt_segments_hh_select on debt_segments
  for select using (public.is_household_member(household_id));
create policy debt_segments_hh_insert on debt_segments
  for insert with check (
    public.is_household_member(household_id) and user_id = auth.uid()
  );
create policy debt_segments_hh_update on debt_segments
  for update using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  ) with check (public.is_household_member(household_id));
create policy debt_segments_hh_delete on debt_segments
  for delete using (
    public.is_household_member(household_id)
    and (user_id = auth.uid() or public.household_shared_editing(household_id))
  );
