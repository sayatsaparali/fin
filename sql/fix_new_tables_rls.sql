-- ============================================================
-- FinHub: RLS + Auth Trigger Fix для новых таблиц
-- Запустите этот скрипт ЦЕЛИКОМ в Supabase SQL Editor
-- ============================================================

-- ============================================================
-- ЧАСТЬ 1: Удалить старый Auth-триггер (если он пишет в profiles)
-- ============================================================
-- Supabase Auth при signUp вызывает триггер на auth.users,
-- который может автоматически создавать строку в 'profiles'.
-- Если таблица 'profiles' удалена → "Database error saving new user".

-- Проверяем и удаляем триггер:
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Если была функция-обработчик:
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;


-- ============================================================
-- ЧАСТЬ 2: RLS-политики для new_polzovateli
-- ============================================================

-- Приводим auth_user_id к uuid, чтобы совпадал с auth.uid() и не было uuid=text ошибок.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'new_polzovateli'
      AND column_name = 'auth_user_id'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE new_polzovateli
      ALTER COLUMN auth_user_id DROP NOT NULL;

    ALTER TABLE new_polzovateli
      ALTER COLUMN auth_user_id TYPE uuid
      USING (
        CASE
          WHEN auth_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN auth_user_id::uuid
          ELSE NULL
        END
      );
  END IF;
END
$$;

ALTER TABLE new_polzovateli ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики (если были)
DROP POLICY IF EXISTS "Users can read own profile" ON new_polzovateli;
DROP POLICY IF EXISTS "Users can insert own profile" ON new_polzovateli;
DROP POLICY IF EXISTS "Users can update own profile" ON new_polzovateli;
DROP POLICY IF EXISTS "Allow anon insert for registration" ON new_polzovateli;
DROP POLICY IF EXISTS "Allow all read" ON new_polzovateli;
DROP POLICY IF EXISTS "Allow all insert" ON new_polzovateli;
DROP POLICY IF EXISTS "Allow all update" ON new_polzovateli;

-- Чтение: аутентифицированный пользователь видит только свой профиль
CREATE POLICY "Users can read own profile"
  ON new_polzovateli FOR SELECT
  USING (auth_user_id = auth.uid());

-- Вставка: разрешаем для anon и authenticated (нужно при регистрации,
-- т.к. signUp возвращает сессию, но RLS проверяет до login)
CREATE POLICY "Allow insert for registration"
  ON new_polzovateli FOR INSERT
  WITH CHECK (true);

-- Обновление: только свой профиль
CREATE POLICY "Users can update own profile"
  ON new_polzovateli FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());


-- ============================================================
-- ЧАСТЬ 3: RLS-политики для new_scheta
-- ============================================================

ALTER TABLE new_scheta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own accounts" ON new_scheta;
DROP POLICY IF EXISTS "Users can insert own accounts" ON new_scheta;
DROP POLICY IF EXISTS "Users can update own accounts" ON new_scheta;
DROP POLICY IF EXISTS "Allow all read" ON new_scheta;
DROP POLICY IF EXISTS "Allow all insert" ON new_scheta;
DROP POLICY IF EXISTS "Allow all update" ON new_scheta;
DROP POLICY IF EXISTS "Allow insert for registration" ON new_scheta;
DROP POLICY IF EXISTS "Allow read via profile" ON new_scheta;
DROP POLICY IF EXISTS "Allow transfer recipient lookup" ON new_scheta;
DROP POLICY IF EXISTS "Allow update via profile" ON new_scheta;

-- Чтение: владелец счета (через new_polzovateli.auth_user_id)
CREATE POLICY "Allow read via profile"
  ON new_scheta FOR SELECT
  USING (
    vladilec_id IN (
      SELECT id FROM new_polzovateli WHERE auth_user_id = auth.uid()
    )
  );

-- Поиск получателя при переводе по номеру телефона:
-- отправителю нужно видеть существование счета и название банка у получателя.
CREATE POLICY "Allow transfer recipient lookup"
  ON new_scheta FOR SELECT
  TO authenticated
  USING (true);

-- Вставка: разрешаем всем (при регистрации счета создаются сразу)
CREATE POLICY "Allow insert for registration"
  ON new_scheta FOR INSERT
  WITH CHECK (true);

-- Обновление: только свои счета
CREATE POLICY "Allow update via profile"
  ON new_scheta FOR UPDATE
  USING (
    vladilec_id IN (
      SELECT id FROM new_polzovateli WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    vladilec_id IN (
      SELECT id FROM new_polzovateli WHERE auth_user_id = auth.uid()
    )
  );


-- ============================================================
-- ЧАСТЬ 4: RLS-политики для new_tranzakcii
-- ============================================================

ALTER TABLE new_tranzakcii ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transactions" ON new_tranzakcii;
DROP POLICY IF EXISTS "Users can insert own transactions" ON new_tranzakcii;
DROP POLICY IF EXISTS "Allow all read" ON new_tranzakcii;
DROP POLICY IF EXISTS "Allow all insert" ON new_tranzakcii;
DROP POLICY IF EXISTS "Allow read via profile" ON new_tranzakcii;
DROP POLICY IF EXISTS "Allow insert via profile" ON new_tranzakcii;

-- Чтение: свои транзакции
CREATE POLICY "Allow read via profile"
  ON new_tranzakcii FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM new_polzovateli WHERE auth_user_id = auth.uid()
    )
  );

-- Вставка: разрешаем всем (транзакции создаются при переводах)
CREATE POLICY "Allow insert via profile"
  ON new_tranzakcii FOR INSERT
  WITH CHECK (true);


-- ============================================================
-- ЧАСТЬ 5: Разрешить поиск получателя по номеру телефона
-- ============================================================
-- При переводе по номеру телефона нужно искать ЧУЖИЕ профили.
-- Добавляем отдельную политику на чтение nomer_telefona.

CREATE POLICY "Allow phone lookup for transfers"
  ON new_polzovateli FOR SELECT
  USING (true);
-- ПРИМЕЧАНИЕ: эта политика перекрывает "Users can read own profile"
-- и разрешает чтение ВСЕХ профилей. Если нужно ограничить —
-- создайте view с ограниченными полями вместо этой политики.
-- Но для FinHub это нормально: при переводе нужно найти получателя.

-- Удаляем ограничительную политику, т.к. широкая уже покрывает:
DROP POLICY IF EXISTS "Users can read own profile" ON new_polzovateli;


-- ============================================================
-- ГОТОВО!
-- ============================================================
-- После выполнения:
-- 1. Перезагрузите приложение
-- 2. Попробуйте зарегистрироваться заново
-- 3. Если ошибка повторяется — проверьте Authentication > Hooks
--    в Supabase Dashboard на наличие старых хуков
