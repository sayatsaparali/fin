import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUserWithRetry } from './authSession';
import { resolveRequiredProfileIdByAuthUserId } from './profileIdentity';
import { getSupabaseClient } from './supabaseClient';
import { normalizeToStandardBankName } from './standardBanks';

export type UserAccount = {
  id: string;
  bank: string;
  balance: number;
};

const mapAccountRow = (row: { id?: string | null; nazvanie_banka?: string | null; balans?: number | null }): UserAccount => ({
  id: String(row.id ?? ''),
  bank: normalizeToStandardBankName(row.nazvanie_banka) ?? String(row.nazvanie_banka ?? 'Bank account'),
  balance: Number(row.balans ?? 0)
});

export const fetchAccountsByProfileId = async (
  supabase: SupabaseClient,
  profileId: string
): Promise<UserAccount[]> => {
  const { data, error } = await supabase
    .from('new_scheta')
    .select('id, nazvanie_banka, balans')
    .eq('vladilec_id', profileId)
    .order('nazvanie_banka', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) =>
    mapAccountRow(
      row as {
        id?: string | null;
        nazvanie_banka?: string | null;
        balans?: number | null;
      }
    )
  );
};

export const fetchAccountsForCurrentUser = async (): Promise<{ profileId: string; accounts: UserAccount[] }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase не настроен. Проверьте переменные окружения.');
  }

  const user = await getAuthUserWithRetry(supabase);
  const profileId = await resolveRequiredProfileIdByAuthUserId(supabase, user.id);
  const accounts = await fetchAccountsByProfileId(supabase, profileId);

  return { profileId, accounts };
};

