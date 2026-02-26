import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUserWithRetry } from './authSession';
import { resolveRequiredProfileIdByAuthUserId } from './profileIdentity';
import { getSupabaseClient, isSchemaRelatedError } from './supabaseClient';
import { normalizeToStandardBankName } from './standardBanks';

export type UserAccount = {
  id: string;
  bank: string;
  balance: number;
};

type AccountRow = {
  id?: string | null;
  nazvanie_banka?: string | null;
  bank_name?: string | null;
  bank?: string | null;
  balans?: number | null;
  balance?: number | null;
};

const mapAccountRow = (row: AccountRow): UserAccount => {
  const bankName = row.nazvanie_banka ?? row.bank_name ?? row.bank;
  const balance = row.balans ?? row.balance;

  return {
    id: String(row.id ?? ''),
    bank: normalizeToStandardBankName(bankName) ?? String(bankName ?? 'Bank account'),
    balance: Number(balance ?? 0)
  };
};

export const fetchAccountsByProfileId = async (
  supabase: SupabaseClient,
  profileId: string
): Promise<UserAccount[]> => {
  const attempts = [
    () =>
      supabase
        .from('new_scheta')
        .select('id, nazvanie_banka, balans')
        .eq('vladilec_id', profileId)
        .order('nazvanie_banka', { ascending: true }),
    () =>
      supabase
        .from('new_scheta')
        .select('id, bank_name, balance')
        .eq('vladilec_id', profileId)
        .order('bank_name', { ascending: true }),
    () =>
      supabase
        .from('new_scheta')
        .select('id, bank, balance')
        .eq('vladilec_id', profileId)
        .order('bank', { ascending: true })
  ] as const;

  let lastError: unknown = null;

  for (const attempt of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await attempt();

    if (!error) {
      return (data ?? []).map((row) => mapAccountRow(row as AccountRow));
    }

    lastError = error;
    if (!isSchemaRelatedError(error)) {
      throw error;
    }
  }

  throw lastError ?? new Error('Не удалось загрузить счета пользователя.');
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
