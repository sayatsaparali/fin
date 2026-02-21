import { getSupabaseClient } from './supabaseClient';
import {
  buildDeterministicAccountId,
  resolveRequiredProfileIdByAuthUserId
} from './profileIdentity';
import {
  normalizeToStandardBankName,
  STANDARD_BANK_BALANCES,
  STANDARD_BANK_NAMES,
  type StandardBankName
} from './standardBanks';

const insertStandardAccount = async (profileId: string, bankName: StandardBankName) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const accountId = buildDeterministicAccountId(profileId, bankName);

  const { error } = await supabase.from('new_scheta').insert({
    id: accountId,
    vladilec_id: profileId,
    nazvanie_banka: bankName,
    balans: STANDARD_BANK_BALANCES[bankName]
  });

  if (error) throw error;
};

export const ensureStandardAccountsForProfileId = async (
  profileId: string
): Promise<{ created: number; totalStandard: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { created: 0, totalStandard: 0 };

  const { data: existingAccounts, error: fetchError } = await supabase
    .from('new_scheta')
    .select('id, nazvanie_banka')
    .eq('vladilec_id', profileId);

  if (fetchError) throw fetchError;

  const existingBanks = new Set<StandardBankName>();
  for (const row of existingAccounts ?? []) {
    const normalized = normalizeToStandardBankName(
      (row as { nazvanie_banka?: string }).nazvanie_banka
    );
    if (normalized) existingBanks.add(normalized);
  }

  let created = 0;
  for (const bankName of STANDARD_BANK_NAMES) {
    if (existingBanks.has(bankName)) continue;
    // eslint-disable-next-line no-await-in-loop
    await insertStandardAccount(profileId, bankName);
    created += 1;
  }

  return { created, totalStandard: STANDARD_BANK_NAMES.length };
};

export const ensureStandardAccountsForUser = async (
  authUserId: string
): Promise<{ created: number; totalStandard: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { created: 0, totalStandard: 0 };
  const profileId = await resolveRequiredProfileIdByAuthUserId(supabase, authUserId);
  return ensureStandardAccountsForProfileId(profileId);
};
