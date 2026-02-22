import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseUrl.startsWith('https://') || !supabaseAnonKey) {
  const criticalMessage = [
    'FINHUB CRITICAL CONFIG ERROR',
    '',
    'Supabase env keys are invalid.',
    `VITE_SUPABASE_URL=${supabaseUrl ?? '[EMPTY]'}`,
    `VITE_SUPABASE_ANON_KEY=${supabaseAnonKey ? '[SET]' : '[EMPTY]'}`
  ].join('\n');

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-alert
    alert(criticalMessage);
  }
  // eslint-disable-next-line no-console
  console.error(criticalMessage);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSupabaseClient = () => supabase;

// API compatibility: no-op helpers for existing imports.
export const refreshSupabaseClient = () => {};
export const markSupabaseClientAsFailed = () => {};

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
