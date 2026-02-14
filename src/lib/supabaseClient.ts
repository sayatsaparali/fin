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
