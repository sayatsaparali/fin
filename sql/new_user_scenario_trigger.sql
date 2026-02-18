-- FinHub: unique per-user life scenario transactions
-- Run this in Supabase SQL Editor once.

create or replace function public.finhub_seed_new_user_scenario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scenario_id int;
  i int;
  chance float;
  tx_counterparty text;
  tx_description text;
  tx_type text;
  tx_amount numeric;
  tx_bank text;
  occurred_at_ts timestamptz;
begin
  -- Deterministic but unique scenario per user (0 or 1)
  scenario_id := abs(hashtextextended(new.id::text, 73))::int % 2;

  -- Ensure profile record exists (safe with register upsert)
  insert into public.profiles (user_id, first_name, last_name, birth_date)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (user_id) do nothing;

  -- Base accounts for realistic dashboard split
  insert into public.accounts (user_id, bank, balance)
  values
    (new.id, 'Kaspi Gold', 1200000 + floor(random() * 500000)::int),
    (new.id, 'Halyk', 700000 + floor(random() * 400000)::int),
    (new.id, 'Наличные', 90000 + floor(random() * 180000)::int)
  on conflict do nothing;

  -- Generate ~30 transactions over last 30 days
  for i in 1..30 loop
    chance := random();

    -- Scenario A: taxi + coffee heavy
    if scenario_id = 0 then
      if chance < 0.72 then
        tx_type := 'expense';

        if chance < 0.34 then
          tx_counterparty := 'Yandex Taxi';
          tx_description := 'Поездка по городу';
          tx_amount := (1400 + floor(random() * 5200))::numeric;
        elsif chance < 0.52 then
          tx_counterparty := 'Starbucks';
          tx_description := 'Кофе и снеки';
          tx_amount := (1700 + floor(random() * 2800))::numeric;
        elsif chance < 0.64 then
          tx_counterparty := 'App Store';
          tx_description := 'Подписка и покупки';
          tx_amount := (890 + floor(random() * 3600))::numeric;
        else
          tx_counterparty := 'Magnum';
          tx_description := 'Покупки в супермаркете';
          tx_amount := (7500 + floor(random() * 26000))::numeric;
        end if;
      else
        tx_type := 'income';
        if chance < 0.9 then
          tx_counterparty := 'ТОО Logic Layer';
          tx_description := 'Зачисление дохода';
          tx_amount := (120000 + floor(random() * 420000))::numeric;
        else
          tx_counterparty := 'FinHub Bonus';
          tx_description := 'Бонусы';
          tx_amount := (6000 + floor(random() * 22000))::numeric;
        end if;
      end if;

    -- Scenario B: family transfers + magnum + rent
    else
      if chance < 0.67 then
        tx_type := 'expense';

        if chance < 0.36 then
          tx_counterparty := 'Magnum';
          tx_description := 'Покупки для дома';
          tx_amount := (9000 + floor(random() * 30000))::numeric;
        elsif chance < 0.52 then
          tx_counterparty := 'Оплата аренды';
          tx_description := 'Ежемесячная аренда';
          tx_amount := (150000 + floor(random() * 70000))::numeric;
        elsif chance < 0.62 then
          tx_counterparty := 'Оплата коммунальных';
          tx_description := 'Свет, вода, интернет';
          tx_amount := (12000 + floor(random() * 32000))::numeric;
        else
          tx_counterparty := 'Yandex Taxi';
          tx_description := 'Поездка по делам';
          tx_amount := (1200 + floor(random() * 4500))::numeric;
        end if;
      else
        tx_type := 'income';
        if chance < 0.83 then
          tx_counterparty := 'Мама';
          tx_description := 'Перевод от семьи';
          tx_amount := (12000 + floor(random() * 65000))::numeric;
        elsif chance < 0.93 then
          tx_counterparty := 'Арман';
          tx_description := 'Перевод от Арман';
          tx_amount := (10000 + floor(random() * 90000))::numeric;
        else
          tx_counterparty := 'ТОО Logic Layer';
          tx_description := 'Зачисление дохода';
          tx_amount := (90000 + floor(random() * 350000))::numeric;
        end if;
      end if;
    end if;

    tx_bank :=
      case
        when random() < 0.58 then 'Kaspi Gold'
        when random() < 0.85 then 'Halyk'
        else 'Наличные'
      end;

    occurred_at_ts :=
      date_trunc('day', now())
      - make_interval(days => floor(random() * 30)::int)
      + make_interval(hours => (8 + floor(random() * 14)::int), mins => floor(random() * 60)::int);

    insert into public.transactions (
      user_id,
      counterparty,
      description,
      type,
      amount,
      bank,
      occurred_at
    )
    values (
      new.id,
      tx_counterparty,
      tx_description,
      tx_type,
      tx_amount,
      tx_bank,
      occurred_at_ts
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_finhub_seed on auth.users;

create trigger on_auth_user_created_finhub_seed
after insert on auth.users
for each row
execute function public.finhub_seed_new_user_scenario();
