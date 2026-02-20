-- FinHub deterministic identity migration
-- Goal:
-- 1) profiles.id becomes deterministic user ID: YYMMDD-XXXXXX (text)
-- 2) accounts.user_id strictly stores profiles.id (text, no UUID generation)
-- 3) accounts.id format: [USER_ID]-[BANK_CODE], e.g. 000221-123456-KASPI
-- 4) helper for "account -> owner profile" lookup

begin;

-- Drop old foreign keys on accounts early so column type changes can run.
do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.accounts'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.accounts drop constraint if exists %I', fk.conname);
  end loop;
end
$$;

-- profiles: add auth link and convert id to text if needed
alter table public.profiles
  add column if not exists auth_user_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    alter table public.profiles
      alter column id type text using id::text;
  end if;
end
$$;

update public.profiles
set auth_user_id = id::uuid
where auth_user_id is null
  and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

create unique index if not exists profiles_auth_user_id_uniq
  on public.profiles(auth_user_id);

-- accounts: remove random uuid defaults and force text identity columns
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    alter table public.accounts
      alter column id type text using id::text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    alter table public.accounts
      alter column user_id type text using user_id::text;
  end if;
end
$$;

alter table public.accounts alter column id drop default;
alter table public.accounts alter column user_id drop default;

alter table public.accounts
  add constraint accounts_user_id_profiles_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- transactions.user_id must support deterministic text profile IDs.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    alter table public.transactions
      alter column user_id type text using user_id::text;
  end if;
end
$$;

-- Helper: extract parent profile ID from deterministic account ID
-- Example input: 000221-123456-KASPI -> 000221-123456
create or replace function public.extract_profile_id_from_account_id(p_account_id text)
returns text
language sql
immutable
as $$
  select case
    when p_account_id ~ '^[0-9]{6}-[0-9]{6}-[A-Z0-9_]+$'
      then substring(p_account_id from '^([0-9]{6}-[0-9]{6})-')
    else null
  end
$$;

-- RLS rewrite: ownership is determined via profiles.auth_user_id -> auth.uid()
alter table public.accounts enable row level security;
drop policy if exists "accounts_select_own_profile" on public.accounts;
create policy "accounts_select_own_profile"
  on public.accounts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = accounts.user_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "accounts_insert_own_profile" on public.accounts;
create policy "accounts_insert_own_profile"
  on public.accounts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = accounts.user_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "accounts_update_own_profile" on public.accounts;
create policy "accounts_update_own_profile"
  on public.accounts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = accounts.user_id
        and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = accounts.user_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "accounts_delete_own_profile" on public.accounts;
create policy "accounts_delete_own_profile"
  on public.accounts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = accounts.user_id
        and p.auth_user_id = auth.uid()
    )
  );

alter table public.transactions enable row level security;
drop policy if exists "transactions_select_own_profile" on public.transactions;
create policy "transactions_select_own_profile"
  on public.transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = transactions.user_id
        and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "transactions_insert_own_profile" on public.transactions;
create policy "transactions_insert_own_profile"
  on public.transactions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = transactions.user_id
        and p.auth_user_id = auth.uid()
    )
  );

commit;
