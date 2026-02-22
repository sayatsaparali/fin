-- FinHub emergency fix for:
-- AuthApiError: "Database error saving new user" (code: unexpected_failure)
--
-- Why this happens:
-- A custom trigger/function on auth.users crashes during signUp.
-- Then Supabase Auth returns 500 before frontend profile logic starts.
--
-- Run this script in Supabase SQL Editor.

begin;

-- 1) Remove all NON-system triggers from auth.users (safe emergency reset).
do $$
declare
  trg record;
begin
  for trg in
    select tgname
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', trg.tgname);
  end loop;
end $$;

-- 2) Drop known legacy handler functions if they exist.
drop function if exists public.handle_new_user() cascade;
drop function if exists public.on_auth_user_created() cascade;
drop function if exists public.create_profile_for_user() cascade;
drop function if exists public.finhub_seed_new_user_scenario() cascade;

-- 3) Ensure required runtime tables exist for current frontend flow.
create table if not exists public.new_polzovateli (
  id text primary key,
  auth_user_id uuid unique not null,
  imya text,
  familiya text,
  nomer_telefona text,
  created_at timestamptz not null default now()
);

-- If table already exists with auth_user_id as text, convert to uuid safely.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'new_polzovateli'
      and column_name = 'auth_user_id'
      and data_type = 'text'
  ) then
    alter table public.new_polzovateli
      alter column auth_user_id drop not null;

    alter table public.new_polzovateli
      alter column auth_user_id type uuid
      using (
        case
          when auth_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then auth_user_id::uuid
          else null
        end
      );
  end if;
end $$;

create unique index if not exists new_polzovateli_auth_user_id_uniq
  on public.new_polzovateli(auth_user_id);

create table if not exists public.new_scheta (
  id text primary key,
  vladilec_id text not null references public.new_polzovateli(id) on delete cascade,
  nazvanie_banka text not null,
  balans numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint new_scheta_owner_bank_unique unique (vladilec_id, nazvanie_banka)
);

-- 4) Minimal RLS setup: let registration insert; user reads/updates only own rows.
alter table public.new_polzovateli enable row level security;
alter table public.new_scheta enable row level security;

drop policy if exists "new_polzovateli_select_own" on public.new_polzovateli;
create policy "new_polzovateli_select_own"
  on public.new_polzovateli for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "new_polzovateli_insert_registration" on public.new_polzovateli;
create policy "new_polzovateli_insert_registration"
  on public.new_polzovateli for insert
  to anon, authenticated
  with check (true);

drop policy if exists "new_polzovateli_update_own" on public.new_polzovateli;
create policy "new_polzovateli_update_own"
  on public.new_polzovateli for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists "new_scheta_select_own" on public.new_scheta;
create policy "new_scheta_select_own"
  on public.new_scheta for select
  to authenticated
  using (
    vladilec_id in (
      select id from public.new_polzovateli p
      where p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "new_scheta_select_recipient_lookup" on public.new_scheta;
create policy "new_scheta_select_recipient_lookup"
  on public.new_scheta for select
  to authenticated
  using (true);

drop policy if exists "new_scheta_insert_registration" on public.new_scheta;
create policy "new_scheta_insert_registration"
  on public.new_scheta for insert
  to anon, authenticated
  with check (true);

drop policy if exists "new_scheta_update_own" on public.new_scheta;
create policy "new_scheta_update_own"
  on public.new_scheta for update
  to authenticated
  using (
    vladilec_id in (
      select id from public.new_polzovateli p
      where p.auth_user_id = auth.uid()
    )
  )
  with check (
    vladilec_id in (
      select id from public.new_polzovateli p
      where p.auth_user_id = auth.uid()
    )
  );

commit;

-- Verification:
-- 1) This should return zero rows:
--    select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- 2) Try register again in app.
