-- FinHub: backfill missing recipient accounts + auto-create trigger
-- Run in Supabase SQL Editor.

begin;

-- 1) Backfill for all existing profiles in new_polzovateli
insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
select p.id || '-KASPI', p.id, 'Kaspi Bank', 50000
from public.new_polzovateli p
on conflict (id) do nothing;

insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
select p.id || '-HALYK', p.id, 'Halyk Bank', 75000
from public.new_polzovateli p
on conflict (id) do nothing;

insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
select p.id || '-BCC', p.id, 'BCC Bank', 0
from public.new_polzovateli p
on conflict (id) do nothing;

-- 2) Trigger for future profiles
create or replace function public.create_default_new_scheta_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
  values
    (new.id || '-KASPI', new.id, 'Kaspi Bank', 50000),
    (new.id || '-HALYK', new.id, 'Halyk Bank', 75000),
    (new.id || '-BCC', new.id, 'BCC Bank', 0)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_new_polzovateli_default_accounts on public.new_polzovateli;
create trigger trg_new_polzovateli_default_accounts
after insert on public.new_polzovateli
for each row
execute function public.create_default_new_scheta_for_profile();

commit;

-- Diagnostics:
-- 1) Users without any account (should be 0):
-- select count(*) from public.new_polzovateli p
-- where not exists (select 1 from public.new_scheta s where s.vladilec_id = p.id);
--
-- 2) Account count per user:
-- select p.id, p.imya, p.familiya, count(s.id) as account_count
-- from public.new_polzovateli p
-- left join public.new_scheta s on s.vladilec_id = p.id
-- group by p.id, p.imya, p.familiya
-- order by account_count asc, p.created_at desc;
