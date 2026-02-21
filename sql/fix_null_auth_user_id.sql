-- FinHub: массовый ремонт NULL auth_user_id для существующих пользователей
-- Выполните в Supabase SQL Editor ОДИН раз

-- Шаг 1: заполнить auth_user_id из триггерных данных
-- (если auth_user_id пустой, но профиль был создан триггером,
--  ищем соответствие через raw_user_meta_data)
update public.profiles p
set auth_user_id = u.id
from auth.users u
where p.auth_user_id is null
  and (
    -- Совпадение по телефону
    (p.phone_number is not null and p.phone_number = u.raw_user_meta_data ->> 'phone_number')
    -- Совпадение по email (через auth.users.email)
    or (p.first_name is not null and p.last_name is not null
        and p.first_name = u.raw_user_meta_data ->> 'first_name'
        and p.last_name = u.raw_user_meta_data ->> 'last_name')
  );

-- Шаг 2: для профилей, где id совпадает с auth UUID (legacy)
update public.profiles
set auth_user_id = id::uuid
where auth_user_id is null
  and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Результат: проверьте, сколько ещё пустых
select count(*) as remaining_null_auth_user_id
from public.profiles
where auth_user_id is null;
