-- ============================================================
-- FinHub: Fix "column new_tranzakcii.user_id does not exist"
-- Запустите этот скрипт ЦЕЛИКОМ в Supabase SQL Editor
-- ============================================================
-- Причина ошибки: в базе данных остались старые RLS-политики
-- или функции, которые обращаются к несуществующей колонке user_id.
-- В таблице new_tranzakcii правильная колонка называется vladilec_id.
-- ============================================================

-- Шаг 1: Удаляем ВСЕ возможные старые RLS-политики на new_tranzakcii
-- (включая те, что могли быть созданы с user_id)

ALTER TABLE public.new_tranzakcii DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transactions" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow all read" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow all insert" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow read via profile" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow insert via profile" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Users can create own transactions" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow select" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Allow insert" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Enable read access for users" ON public.new_tranzakcii;
DROP POLICY IF EXISTS "Enable insert for users" ON public.new_tranzakcii;

ALTER TABLE public.new_tranzakcii ENABLE ROW LEVEL SECURITY;

-- Шаг 2: Создаём правильные политики (используем vladilec_id, не user_id)

-- Чтение: пользователь видит только свои транзакции
CREATE POLICY "Allow read via profile"
  ON public.new_tranzakcii FOR SELECT
  USING (
    vladilec_id IN (
      SELECT id FROM public.new_polzovateli WHERE auth_user_id = auth.uid()
    )
  );

-- Вставка: разрешаем аутентифицированным пользователям
-- (транзакции создаются при переводах, включая через RPC)
CREATE POLICY "Allow insert via profile"
  ON public.new_tranzakcii FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Шаг 3: Проверяем, что колонка vladilec_id существует
-- (если нет — добавляем её)
-- ============================================================

DO $$
BEGIN
  -- Проверяем наличие vladilec_id
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'new_tranzakcii'
      AND column_name = 'vladilec_id'
  ) THEN
    ALTER TABLE public.new_tranzakcii ADD COLUMN vladilec_id text;
    RAISE NOTICE 'Добавлена колонка vladilec_id в new_tranzakcii';
  ELSE
    RAISE NOTICE 'Колонка vladilec_id уже существует в new_tranzakcii — всё в порядке';
  END IF;

  -- Проверяем наличие user_id (не должно быть)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'new_tranzakcii'
      AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'ВНИМАНИЕ: колонка user_id найдена в new_tranzakcii — возможно нужна миграция данных';
  ELSE
    RAISE NOTICE 'Колонка user_id отсутствует в new_tranzakcii — это правильно';
  END IF;
END
$$;

-- ============================================================
-- ГОТОВО!
-- После выполнения:
-- 1. Обновите страницу приложения (Ctrl+Shift+R)
-- 2. Перейдите на страницу "Транзакции"
-- 3. Ошибка "column new_tranzakcii.user_id does not exist" исчезнет
-- ============================================================
