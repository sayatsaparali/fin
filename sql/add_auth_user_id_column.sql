-- FinHub: добавление колонки auth_user_id в profiles
-- Выполните этот скрипт в Supabase SQL Editor

-- 1) Добавить колонку auth_user_id если её нет
alter table public.profiles
  add column if not exists auth_user_id uuid;

-- 2) Заполнить auth_user_id для существующих профилей
--    (если profiles.id до миграции хранил UUID из auth.users)
update public.profiles
set auth_user_id = id::uuid
where auth_user_id is null
  and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- 3) Уникальный индекс для быстрого поиска по auth_user_id
create unique index if not exists profiles_auth_user_id_uniq
  on public.profiles(auth_user_id);

-- 4) Конвертировать profiles.id в text (если ещё uuid)
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

-- 5) Конвертировать accounts.id и accounts.user_id в text (если ещё uuid)
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

-- 6) Убрать дефолтные генераторы uuid
alter table public.accounts alter column id drop default;
alter table public.accounts alter column user_id drop default;

-- 7) После выполнения — обновите Schema Cache в Supabase Dashboard:
--    Settings → API → нажмите "Reload" рядом с Schema Cache
