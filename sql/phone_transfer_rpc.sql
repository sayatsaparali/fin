-- FinHub: execute_phone_transfer (8 params, TEXT IDs, new tables only)
-- NOTE: new_tranzakcii insert uses vladilec_id/sender_iin/recipient_iin (no user_id).

-- Ensure technical system user exists.
insert into public.new_polzovateli (id, auth_user_id, imya, familiya, nomer_telefona)
values (
  'finhub_system',
  '00000000-0000-0000-0000-000000000001',
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

-- Drop all old overloads/signatures.
do $$
declare
  v_signature text;
begin
  for v_signature in
    select p.oid::regprocedure::text
    from pg_proc p
    where p.proname = 'execute_phone_transfer'
      and p.pronamespace = 'public'::regnamespace
  loop
    execute format('drop function if exists %s;', v_signature);
  end loop;
end;
$$;

create function public.execute_phone_transfer(
  p_amount numeric,
  p_commission numeric,
  p_recipient_account_id text,
  p_recipient_counterparty text,
  p_recipient_user_id text,
  p_sender_account_id text,
  p_sender_counterparty text,
  p_sender_user_id text
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
  if nullif(trim(p_sender_user_id), '') is null
     or nullif(trim(p_recipient_user_id), '') is null then
    raise exception 'Sender/recipient user id is required';
  end if;

  if nullif(trim(p_sender_account_id), '') is null
     or nullif(trim(p_recipient_account_id), '') is null then
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

  -- Self-healing in case the system account was deleted.
  insert into public.new_scheta (id, vladilec_id, nazvanie_banka, balans)
  values (v_system_account_id, v_system_user_id, 'FinHub System', 0)
  on conflict (id) do update
  set
    vladilec_id = excluded.vladilec_id,
    nazvanie_banka = excluded.nazvanie_banka;

  select s.balans, s.nazvanie_banka
  into v_sender_balance, v_sender_bank
  from public.new_scheta s
  where s.id = p_sender_account_id
    and s.vladilec_id = p_sender_user_id
  for update;

  if not found then
    raise exception 'Sender account not found';
  end if;

  select s.nazvanie_banka
  into v_recipient_bank
  from public.new_scheta s
  where s.id = p_recipient_account_id
    and s.vladilec_id = p_recipient_user_id
  for update;

  if not found then
    raise exception 'Recipient account not found';
  end if;

  perform 1
  from public.new_scheta s
  where s.id = v_system_account_id
    and s.vladilec_id = v_system_user_id
  for update;

  if not found then
    raise exception 'System commission account not found';
  end if;

  if v_sender_balance < v_total_debit then
    raise exception 'Insufficient funds';
  end if;

  -- 1) Sender balance: amount + commission
  update public.new_scheta
  set balans = balans - v_total_debit
  where id = p_sender_account_id
    and vladilec_id = p_sender_user_id;

  -- 2) Recipient balance: amount
  update public.new_scheta
  set balans = balans + p_amount
  where id = p_recipient_account_id
    and vladilec_id = p_recipient_user_id;

  -- 3) System balance: commission
  if p_commission > 0 then
    update public.new_scheta
    set balans = balans + p_commission
    where id = v_system_account_id
      and vladilec_id = v_system_user_id;
  end if;

  -- Sender transaction (expense)
  insert into public.new_tranzakcii (
    vladilec_id,
    sender_iin,
    sender_bank,
    recipient_iin,
    recipient_bank,
    amount,
    clean_amount,
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
    coalesce(v_sender_bank, 'Bank'),
    p_recipient_user_id,
    coalesce(v_recipient_bank, 'Bank'),
    -v_total_debit,
    p_amount,
    'Перевод по номеру телефона',
    'Переводы',
    coalesce(nullif(trim(p_sender_counterparty), ''), 'Перевод по номеру телефона'),
    p_commission,
    coalesce(v_sender_bank, 'Bank'),
    'expense',
    'minus',
    now()
  );

  -- Recipient transaction (income)
  insert into public.new_tranzakcii (
    vladilec_id,
    sender_iin,
    sender_bank,
    recipient_iin,
    recipient_bank,
    amount,
    clean_amount,
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
    p_sender_user_id,
    coalesce(v_sender_bank, 'Bank'),
    p_recipient_user_id,
    coalesce(v_recipient_bank, 'Bank'),
    p_amount,
    p_amount,
    coalesce(
      'Перевод от ' || nullif(trim(p_recipient_counterparty), ''),
      'Перевод от пользователя FinHub'
    ),
    'Переводы',
    coalesce(nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
    0,
    coalesce(v_recipient_bank, 'Bank'),
    'income',
    'plus',
    now()
  );

  -- System commission transaction (income)
  if p_commission > 0 then
    insert into public.new_tranzakcii (
      vladilec_id,
      sender_iin,
      sender_bank,
      recipient_iin,
      recipient_bank,
      amount,
      clean_amount,
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
      p_sender_user_id,
      coalesce(v_sender_bank, 'Bank'),
      v_system_user_id,
      'FinHub System',
      p_commission,
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
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
