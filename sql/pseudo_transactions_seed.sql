-- 1) Migration: add columns if they do not exist
alter table public.transactions
  add column if not exists description text;

alter table public.transactions
  add column if not exists counterparty text;

alter table public.transactions
  add column if not exists bank text;

-- 2) Seed ~30 realistic transactions for the latest user
-- Optional cleanup before insert:
-- delete from public.transactions
-- where user_id = (select id from auth.users order by created_at desc limit 1)
--   and occurred_at >= now() - interval '31 days';

with target_user as (
  select id
  from auth.users
  order by created_at desc
  limit 1
),
seed(counterparty, description, type, amount, bank, days_ago, hour_of_day) as (
  values
    ('ТОО Logic Layer', 'Зарплата за месяц', 'income', 520000, 'Kaspi Gold', 2, 10),
    ('ТОО Logic Layer', 'Аванс', 'income', 180000, 'Halyk', 18, 10),
    ('Александр В.', 'Перевод от друга', 'income', 45000, 'Kaspi Gold', 4, 19),
    ('FinHub Bonus', 'Бонусы', 'income', 12000, 'Kaspi Gold', 9, 12),
    ('FinHub Bonus', 'Бонусы', 'income', 8000, 'Наличные', 21, 14),

    ('Magnum', 'Покупки в супермаркете', 'expense', 18750, 'Kaspi Gold', 1, 20),
    ('Yandex Taxi', 'Поездка по городу', 'expense', 3100, 'Kaspi Gold', 1, 9),
    ('Starbucks', 'Кофе', 'expense', 2950, 'Kaspi Gold', 3, 11),
    ('Оплата коммунальных', 'Коммунальные услуги', 'expense', 36500, 'Halyk', 5, 9),
    ('App Store', 'Подписка iCloud', 'expense', 1490, 'Kaspi Gold', 6, 8),

    ('Magnum', 'Покупки в супермаркете', 'expense', 22400, 'Halyk', 7, 20),
    ('Yandex Taxi', 'Поездка в офис', 'expense', 2750, 'Kaspi Gold', 8, 9),
    ('Starbucks', 'Кофе', 'expense', 3200, 'Kaspi Gold', 8, 17),
    ('Magnum', 'Покупки в супермаркете', 'expense', 15900, 'Наличные', 10, 19),
    ('App Store', 'Подписка Pro-версия', 'expense', 2490, 'Halyk', 11, 8),

    ('Оплата коммунальных', 'Вода и электричество', 'expense', 28400, 'Halyk', 12, 9),
    ('Yandex Taxi', 'Поездка домой', 'expense', 3550, 'Kaspi Gold', 12, 22),
    ('Magnum', 'Покупки в супермаркете', 'expense', 19800, 'Kaspi Gold', 13, 19),
    ('Starbucks', 'Кофе', 'expense', 2750, 'Kaspi Gold', 14, 10),
    ('Александр В.', 'Возврат долга', 'income', 30000, 'Наличные', 15, 13),

    ('App Store', 'Покупка приложения', 'expense', 990, 'Kaspi Gold', 16, 8),
    ('Magnum', 'Покупки в супермаркете', 'expense', 24300, 'Halyk', 17, 20),
    ('Yandex Taxi', 'Поездка на встречу', 'expense', 2900, 'Kaspi Gold', 19, 9),
    ('Starbucks', 'Кофе', 'expense', 3100, 'Наличные', 20, 16),
    ('FinHub Bonus', 'Бонусы', 'income', 15000, 'Kaspi Gold', 22, 13),

    ('Оплата коммунальных', 'Интернет и связь', 'expense', 11200, 'Halyk', 23, 9),
    ('Magnum', 'Покупки в супермаркете', 'expense', 17600, 'Kaspi Gold', 24, 19),
    ('Yandex Taxi', 'Ночная поездка', 'expense', 4100, 'Kaspi Gold', 25, 22),
    ('App Store', 'Подписка', 'expense', 1490, 'Kaspi Gold', 27, 8),
    ('Starbucks', 'Кофе', 'expense', 3400, 'Halyk', 29, 11)
)
insert into public.transactions (
  user_id,
  counterparty,
  description,
  type,
  amount,
  bank,
  occurred_at
)
select
  tu.id,
  s.counterparty,
  s.description,
  s.type,
  s.amount,
  s.bank,
  date_trunc('day', now())
    - make_interval(days => s.days_ago)
    + make_interval(hours => s.hour_of_day, mins => (s.days_ago * 7) % 60)
from seed s
cross join target_user tu;
