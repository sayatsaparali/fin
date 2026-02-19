-- FinHub: persistent card number for accounts
alter table public.accounts
add column if not exists card_number text;

-- Optional hygiene: keep only digits, length 16 when present
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_card_number_format_chk'
  ) then
    alter table public.accounts
    add constraint accounts_card_number_format_chk
    check (
      card_number is null
      or (
        card_number ~ '^[0-9]+$'
        and char_length(card_number) = 16
      )
    );
  end if;
end
$$;
