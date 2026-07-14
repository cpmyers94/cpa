-- Guarantee every new auth user gets a profile and a personal household at
-- signup time, independent of the client. This makes the app's ensure_household()
-- RPC a redundant safety net rather than a hard dependency.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
    on conflict (id) do nothing;

  if not exists (select 1 from public.household_members where user_id = new.id) then
    insert into public.households (name, invite_code)
      values ('My Household', public.gen_invite_code())
      returning id into hid;
    insert into public.household_members (household_id, user_id, role)
      values (hid, new.id, 'owner');
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
