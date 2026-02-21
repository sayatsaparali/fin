import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let lastInitFailed = false;

const maskSecret = (value: string | undefined) => {
  if (!value) return '[EMPTY]';
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const buildCriticalEnvMessage = (supabaseUrl: string | undefined, supabaseAnonKey: string | undefined) =>
  [
    'FINHUB CRITICAL CONFIG ERROR',
    '',
    'Supabase keys are invalid in runtime bundle (likely Vercel env issue).',
    '',
    `VITE_SUPABASE_URL: ${supabaseUrl ?? '[EMPTY]'}`,
    `VITE_SUPABASE_ANON_KEY: ${maskSecret(supabaseAnonKey)}`,
    '',
    'Expected:',
    "- URL must start with 'https://'",
    '- ANON KEY must be non-empty'
  ].join('\n');

const createNoCacheFetch = (): typeof fetch => {
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return fetch(input, {
      ...init,
      cache: 'no-store',
      headers
    });
  };
};

export const getSupabaseClient = () => {
  if (supabase && !lastInitFailed) return supabase;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const hasValidUrl = Boolean(supabaseUrl && supabaseUrl.startsWith('https://'));
  const hasValidAnonKey = Boolean(supabaseAnonKey);

  if (!hasValidUrl || !hasValidAnonKey) {
    const criticalMessage = buildCriticalEnvMessage(supabaseUrl, supabaseAnonKey);
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-alert
      alert(criticalMessage);
    }
    // eslint-disable-next-line no-console
    console.error(criticalMessage);
    lastInitFailed = true;
    supabase = null;
    return null;
  }

  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: createNoCacheFetch(),
        headers: {
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0'
        }
      }
    });
    lastInitFailed = false;
    return supabase;
  } catch (initError) {
    lastInitFailed = true;
    supabase = null;
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Supabase client:', initError);
    return null;
  }
};

/**
 * Сброс кэша Supabase клиента.
 * Вызывайте при ошибках схемы (42703, 42P10) — следующий вызов
 * getSupabaseClient() создаст новое подключение.
 */
export const refreshSupabaseClient = () => {
  lastInitFailed = false;
  supabase = null;
};

/** Принудительно помечает текущий клиент как невалидный и разрешает пересоздание на следующем вызове */
export const markSupabaseClientAsFailed = () => {
  lastInitFailed = true;
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
