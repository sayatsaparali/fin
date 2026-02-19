-- FinHub: atomic phone transfer between users
create or replace function public.execute_phone_transfer(
  p_sender_user_id uuid,
  p_sender_account_id uuid,
  p_recipient_user_id uuid,
  p_recipient_account_id uuid,
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
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if p_commission is null or p_commission < 0 then
    raise exception 'Commission must be >= 0';
  end if;

  select balance, bank
  into v_sender_balance, v_sender_bank
  from accounts
  where id = p_sender_account_id
    and user_id = p_sender_user_id
  for update;

  if not found then
    raise exception 'Sender account not found';
  end if;

  select bank
  into v_recipient_bank
  from accounts
  where id = p_recipient_account_id
    and user_id = p_recipient_user_id
  for update;

  if not found then
    raise exception 'Recipient account not found';
  end if;

  if v_sender_balance < (p_amount + p_commission) then
    raise exception 'Insufficient funds';
  end if;

  update accounts
  set balance = balance - (p_amount + p_commission)
  where id = p_sender_account_id
    and user_id = p_sender_user_id;

  update accounts
  set balance = balance + p_amount
  where id = p_recipient_account_id
    and user_id = p_recipient_user_id;

  begin
    insert into transactions (user_id, amount, description, category, counterparty, commission, type, date)
    values
      (
        p_sender_user_id,
        -(p_amount + p_commission),
        coalesce('Перевод ' || nullif(trim(p_sender_counterparty), ''), 'Перевод по номеру телефона'),
        'Переводы',
        coalesce(p_sender_counterparty, 'Перевод по номеру телефона'),
        p_commission,
        'expense',
        now()
      ),
      (
        p_recipient_user_id,
        p_amount,
        coalesce('Перевод от ' || nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
        'Переводы',
        coalesce(p_recipient_counterparty, 'Перевод от пользователя FinHub'),
        0,
        'income',
        now()
      );
  exception
    when undefined_column then
      begin
        insert into transactions (user_id, amount, type, description, counterparty, commission, occurred_at, bank)
        values
          (
            p_sender_user_id,
            -(p_amount + p_commission),
            'expense',
            coalesce('Перевод ' || nullif(trim(p_sender_counterparty), ''), 'Перевод по номеру телефона'),
            coalesce(p_sender_counterparty, 'Перевод по номеру телефона'),
            p_commission,
            now(),
            v_sender_bank
          ),
          (
            p_recipient_user_id,
            p_amount,
            'income',
            coalesce('Перевод от ' || nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
            coalesce(p_recipient_counterparty, 'Перевод от пользователя FinHub'),
            0,
            now(),
            v_recipient_bank
          );
      exception
        when undefined_column then
          insert into transactions (user_id, amount, type, description, counterparty, occurred_at, bank)
          values
            (
              p_sender_user_id,
              -(p_amount + p_commission),
              'expense',
              coalesce('Перевод ' || nullif(trim(p_sender_counterparty), ''), 'Перевод по номеру телефона'),
              coalesce(p_sender_counterparty, 'Перевод по номеру телефона'),
              now(),
              v_sender_bank
            ),
            (
              p_recipient_user_id,
              p_amount,
              'income',
              coalesce('Перевод от ' || nullif(trim(p_recipient_counterparty), ''), 'Перевод от пользователя FinHub'),
              coalesce(p_recipient_counterparty, 'Перевод от пользователя FinHub'),
              now(),
              v_recipient_bank
            );
      end;
  end;
end;
$$;

grant execute on function public.execute_phone_transfer(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  text,
  text
) to authenticated;
