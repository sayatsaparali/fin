-- FinHub: favorites contacts table + RLS policies
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone_number text not null,
  bank_name text not null,
  avatar_url text,
  category text not null check (category in ('phone', 'card', 'own')),
  created_at timestamptz not null default now()
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);
create index if not exists favorites_created_at_idx on public.favorites(created_at desc);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own"
  on public.favorites
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites
  for delete
  to authenticated
  using (auth.uid() = user_id);
