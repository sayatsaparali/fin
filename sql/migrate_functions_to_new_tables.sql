-- ================================================================
-- FinHub: миграция SQL-функций с profiles → new_polzovateli
-- Запустите этот файл целиком в Supabase SQL Editor.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1) execute_phone_transfer — пересоздаём с новыми таблицами
-- ────────────────────────────────────────────────────────────────

-- Ensure technical system user exists.
insert into public.new_polzovateli (id, auth_user_id, imya, familiya, nomer_telefona)
values (
  'finhub_system',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'FinHub',
  'System',
  null
)
on conflict (id) do update
set
  auth_user_id = coalesce(public.new_polzovateli.auth_user_id, excluded.auth_user_id),
  imya = coalesce(public.new_polzovateli.imya, excluded.imya),
  familiya = coalesce(public.new_polzovateli.familiya, excluded.familiya);

-- Ensure technical commission account exists.
insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
values ('finhub_system-FEE', 'finhub_system', 'FinHub System', 0)
on conflict (id) do update
set
  vladilec_id = excluded.vladilec_id,
  nazvanie_banka = excluded.nazvanie_banka;

create or replace function public.execute_phone_transfer(
  p_sender_user_id text,
  p_sender_account_id text,
  p_recipient_user_id text,
  p_recipient_account_id text,
  p_amount numeric,
  p_commission numeric,
  p_sender_counterparty text,
  p_recipient_counterparty text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_balance numeric;
  v_sender_bank text;
  v_recipient_bank text;
  v_total_debit numeric;
  v_system_account_id constant text := 'finhub_system-FEE';
  v_system_user_id constant text := 'finhub_system';
begin
  if p_sender_user_id is null or p_recipient_user_id is null then
    raise exception 'Sender/recipient user id is required';
  end if;

  if p_sender_account_id is null or p_recipient_account_id is null then
    raise exception 'Sender/recipient account id is required';
  end if;

  if p_sender_user_id = p_recipient_user_id then
    raise exception 'Self transfer is not allowed';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if p_commission is null or p_commission < 0 then
    raise exception 'Commission must be >= 0';
  end if;

  v_total_debit := p_amount + p_commission;

  -- Self-healing: if system account was removed, recreate it.
  insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
  values (v_system_account_id, v_system_user_id, 'FinHub System', 0)
  on conflict (id) do update
  set
    vladilec_id = excluded.vladilec_id,
    nazvanie_banka = excluded.nazvanie_banka;

  select balans, nazvanie_banka
  into v_sender_balance, v_sender_bank
  from public.new_scheta
  where id = p_sender_account_id
    and vladilec_id = p_sender_user_id
  for update;

  if not found then
    raise exception 'Sender account not found';
  end if;

  select nazvanie_banka
  into v_recipient_bank
  from public.new_scheta
  where id = p_recipient_account_id
    and vladilec_id = p_recipient_user_id
  for update;

  if not found then
    raise exception 'Recipient account not found';
  end if;

  perform 1
  from public.new_scheta
  where id = v_system_account_id
    and vladilec_id = v_system_user_id
  for update;

  if not found then
    raise exception 'System commission account not found';
  end if;

  if v_sender_balance < v_total_debit then
    raise exception 'Insufficient funds';
  end if;

  -- 1) sender: amount + commission
  update public.new_scheta
  set balans = balans - v_total_debit
  where id = p_sender_account_id
    and vladilec_id = p_sender_user_id;

  -- 2) recipient: full transfer amount
  update public.new_scheta
  set balans = balans + p_amount
  where id = p_recipient_account_id
    and vladilec_id = p_recipient_user_id;

  -- 3) FinHub system account: commission amount
  if p_commission > 0 then
    update public.new_scheta
    set balans = balans + p_commission
    where id = v_system_account_id
      and vladilec_id = v_system_user_id;
  end if;

  -- Sender transaction
  insert into public.new_tranzakcii (
    user_id,
    vladilec_id,
    amount,
    description,
    category,
    counterparty,
    commission,
    bank,
    type,
    tip,
    date
  )
  values (
    p_sender_user_id,
    p_sender_user_id,
    -v_total_debit,
    'Перевод по номеру телефона',
    'Переводы',
    coalesce(nullif(trim(p_sender_counterparty), ''), 'Перевод по номеру телефона'),
    p_commission,
    coalesce(v_sender_bank, 'Bank'),
    'expense',
    'minus',
    now()
  );

  -- Recipient transaction
  insert into public.new_tranzakcii (
    user_id,
    vladilec_id,
    amount,
    description,
    category,
    counterparty,
    commission,
    bank,
    type,
    tip,
    date
  )
  values (
    p_recipient_user_id,
    p_recipient_user_id,
    p_amount,
    coalesce('Перевод от ' || nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
    'Переводы',
    coalesce(nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
    0,
    coalesce(v_recipient_bank, 'Bank'),
    'income',
    'plus',
    now()
  );

  -- System commission transaction (for audit)
  if p_commission > 0 then
    insert into public.new_tranzakcii (
      user_id,
      vladilec_id,
      amount,
      description,
      category,
      counterparty,
      commission,
      bank,
      type,
      tip,
      date
    )
    values (
      v_system_user_id,
      v_system_user_id,
      p_commission,
      'Комиссия за перевод',
      'Комиссии',
      coalesce(nullif(trim(p_sender_counterparty), ''), 'Перевод FinHub'),
      0,
      'FinHub System',
      'income',
      'plus',
      now()
    );
  end if;
end;
$$;

grant execute on function public.execute_phone_transfer(
  text, text, text, text, numeric, numeric, text, text
) to authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2) finhub_seed_new_user_scenario — триггер при регистрации
--    Старая версия писала в profiles/accounts/transactions.
--    Новая пишет в new_polzovateli / new_scheta / new_tranzakcii.
-- ────────────────────────────────────────────────────────────────

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
  tx_tip text;
  tx_amount numeric;
  tx_bank text;
  occurred_at_ts timestamptz;
  birth_dt date;
  profile_id text;
begin
  -- Deterministic but unique scenario per user (0 or 1)
  scenario_id := abs(hashtextextended(new.id::text, 73))::int % 2;

  birth_dt := coalesce(
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
    current_date
  );

  profile_id := to_char(birth_dt, 'YYMMDD')
    || '-'
    || lpad((abs(hashtextextended(new.id::text, 3891))::bigint % 1000000)::text, 6, '0');

  -- ▸ new_polzovateli вместо profiles
  insert into public.new_polzovateli (id, auth_user_id, imya, familiya, nomer_telefona)
  values (
    profile_id,
    new.id,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone_number', '')
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        imya = excluded.imya,
        familiya = excluded.familiya,
        nomer_telefona = excluded.nomer_telefona;

  -- ▸ new_scheta вместо accounts
  insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
  values
    (profile_id || '-KASPI', profile_id, 'Kaspi Bank', 1200000 + floor(random() * 500000)::int),
    (profile_id || '-HALYK', profile_id, 'Halyk Bank', 700000 + floor(random() * 400000)::int),
    (profile_id || '-BCC',   profile_id, 'BCC Bank',   90000 + floor(random() * 180000)::int)
  on conflict (id) do nothing;

  -- Generate ~30 transactions over last 30 days
  for i in 1..30 loop
    chance := random();

    -- Scenario A: taxi + coffee heavy
    if scenario_id = 0 then
      if chance < 0.72 then
        tx_type := 'expense';
        tx_tip  := 'minus';

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
        tx_tip  := 'plus';
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
        tx_tip  := 'minus';

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
        tx_tip  := 'plus';
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
        when random() < 0.58 then 'Kaspi Bank'
        when random() < 0.85 then 'Halyk Bank'
        else 'BCC Bank'
      end;

    occurred_at_ts :=
      date_trunc('day', now())
      - make_interval(days => floor(random() * 30)::int)
      + make_interval(hours => (8 + floor(random() * 14)::int), mins => floor(random() * 60)::int);

    -- ▸ new_tranzakcii вместо transactions
    insert into public.new_tranzakcii (
      user_id,
      vladilec_id,
      counterparty,
      description,
      type,
      tip,
      amount,
      bank,
      date
    )
    values (
      profile_id,
      profile_id,
      tx_counterparty,
      tx_description,
      tx_type,
      tx_tip,
      tx_amount,
      tx_bank,
      occurred_at_ts
    );
  end loop;

  return new;
end;
$$;

-- Пересоздаём триггер (на случай если он не был привязан)
drop trigger if exists on_auth_user_created_finhub_seed on auth.users;

create trigger on_auth_user_created_finhub_seed
after insert on auth.users
for each row
execute function public.finhub_seed_new_user_scenario();
