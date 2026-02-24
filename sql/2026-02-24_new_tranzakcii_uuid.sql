begin;

create extension if not exists pgcrypto;

drop table if exists public.new_tranzakcii cascade;

create table public.new_tranzakcii (
  id uuid primary key default gen_random_uuid(),
  vladilec_id uuid not null references auth.users(id) on delete cascade,
  otpravitel_id uuid not null references auth.users(id) on delete cascade,
  poluchatel_id uuid not null references auth.users(id) on delete cascade,

  amount numeric(14,2) not null,
  clean_amount numeric(14,2) not null default 0,
  commission numeric(14,2) not null default 0,

  category text not null default 'Переводы',
  description text,
  counterparty text,

  bank text not null check (bank in ('Kaspi Bank', 'Halyk Bank', 'BCC Bank')),
  otpravitel_bank text not null check (otpravitel_bank in ('Kaspi Bank', 'Halyk Bank', 'BCC Bank')),
  poluchatel_bank text not null check (poluchatel_bank in ('Kaspi Bank', 'Halyk Bank', 'BCC Bank')),

  type text not null check (type in ('income', 'expense')),
  tip text not null check (tip in ('plus', 'minus')),
  balance_after numeric(14,2),

  date timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint new_tranzakcii_non_negative_clean_amount check (clean_amount >= 0),
  constraint new_tranzakcii_non_negative_commission check (commission >= 0)
);

create index new_tranzakcii_vladilec_date_idx
  on public.new_tranzakcii (vladilec_id, date desc);

create index new_tranzakcii_sender_idx
  on public.new_tranzakcii (otpravitel_id, date desc);

create index new_tranzakcii_recipient_idx
  on public.new_tranzakcii (poluchatel_id, date desc);

alter table public.new_tranzakcii enable row level security;

grant select, insert, update, delete on public.new_tranzakcii to authenticated;

create policy new_tranzakcii_select_own
  on public.new_tranzakcii
  for select
  using (auth.uid() = vladilec_id);

create policy new_tranzakcii_insert_own
  on public.new_tranzakcii
  for insert
  with check (auth.uid() = vladilec_id);

create policy new_tranzakcii_update_own
  on public.new_tranzakcii
  for update
  using (auth.uid() = vladilec_id)
  with check (auth.uid() = vladilec_id);

create policy new_tranzakcii_delete_own
  on public.new_tranzakcii
  for delete
  using (auth.uid() = vladilec_id);

commit;
