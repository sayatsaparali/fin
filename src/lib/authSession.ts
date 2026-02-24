import type { SupabaseClient, User } from '@supabase/supabase-js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Мобильные браузеры (особенно Safari) иногда отдают null-user сразу после открытия страницы.
 * Делаем короткие ретраи + fallback на getSession().
 */
export const getAuthUserWithRetry = async (
  supabase: SupabaseClient,
  retries = 2
): Promise<User> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (user) return user;
    if (userError) lastError = userError;

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (session?.user) return session.user;
    if (sessionError) lastError = sessionError;

    if (attempt < retries) {
      // 200ms -> 400ms -> 600ms
      // eslint-disable-next-line no-await-in-loop
      await delay(200 * (attempt + 1));
    }
  }

  throw (lastError as Error) ?? new Error('Пользователь не найден.');
};

