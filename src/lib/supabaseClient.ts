import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (supabase) return supabase;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.warn(
      'Supabase не сконфигурирован. Укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local.'
    );
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey);
  return supabase;
};

/**
 * Сброс кэша Supabase клиента.
 * Вызывайте при ошибках схемы (42703, 42P10) — следующий вызов
 * getSupabaseClient() создаст новое подключение.
 */
export const refreshSupabaseClient = () => {
  supabase = null;
};

/** Проверяет, является ли ошибка связанной со схемой/кэшем Supabase */
export const isSchemaRelatedError = (
  error: { code?: string; message?: string } | null | undefined
): boolean => {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42703' || // undefined column
    code === '42P10' || // invalid column reference
    message.includes('column') ||
    message.includes('schema cache')
  );
};
