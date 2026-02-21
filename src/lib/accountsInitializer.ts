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

const generateKzAccountNumber = () => {
  const digits = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join('');
  return `KZ${digits}`;
};

const insertStandardAccount = async (profileId: string, bankName: StandardBankName) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const accountId = buildDeterministicAccountId(profileId, bankName);

  const { error } = await supabase.from('accounts').insert({
    id: accountId,
    user_id: profileId,
    bank_name: bankName,
    balance: STANDARD_BANK_BALANCES[bankName],
    account_number: generateKzAccountNumber()
  });

  if (error) throw error;
};

export const ensureStandardAccountsForProfileId = async (
  profileId: string
): Promise<{ created: number; totalStandard: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { created: 0, totalStandard: 0 };

  const { data: existingAccounts, error: fetchError } = await supabase
    .from('accounts')
    .select('id, bank_name')
    .eq('user_id', profileId);

  if (fetchError) throw fetchError;

  const existingBanks = new Set<StandardBankName>();
  for (const row of existingAccounts ?? []) {
    const normalized = normalizeToStandardBankName(
      (row as { bank_name?: string }).bank_name
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
