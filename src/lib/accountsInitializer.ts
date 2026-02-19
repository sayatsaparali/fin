import { getSupabaseClient } from './supabaseClient';
import {
  normalizeToStandardBankName,
  STANDARD_BANK_BALANCES,
  STANDARD_BANK_NAMES,
  type StandardBankName
} from './standardBanks';

type AccountRow = {
  id: string;
  bank_name?: string | null;
  bank?: string | null;
};

const generateKzAccountNumber = () => {
  const digits = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join('');
  return `KZ${digits}`;
};

const upsertBankLabels = async (id: string, bankName: StandardBankName) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error: updateBankNameError } = await supabase
    .from('accounts')
    .update({ bank_name: bankName })
    .eq('id', id);

  if (updateBankNameError) {
    const { error: updateBankOnlyError } = await supabase
      .from('accounts')
      .update({ bank: bankName })
      .eq('id', id);

    if (updateBankOnlyError) {
      throw updateBankOnlyError;
    }
  }
};

const insertStandardAccount = async (userId: string, bankName: StandardBankName) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const payload = {
    user_id: userId,
    bank_name: bankName,
    balance: STANDARD_BANK_BALANCES[bankName],
    account_number: generateKzAccountNumber()
  };

  const { error: strictInsertError } = await supabase.from('accounts').insert(payload);
  if (!strictInsertError) return;

  const { error: fallbackInsertError } = await supabase.from('accounts').insert({
    user_id: userId,
    bank: bankName,
    balance: STANDARD_BANK_BALANCES[bankName],
    account_number: generateKzAccountNumber()
  });
  if (!fallbackInsertError) return;

  const { error: minimalInsertError } = await supabase.from('accounts').insert({
    user_id: userId,
    bank: bankName,
    balance: STANDARD_BANK_BALANCES[bankName]
  });

  if (minimalInsertError) {
    throw minimalInsertError;
  }
};

export const ensureStandardAccountsForUser = async (
  userId: string
): Promise<{ created: number; totalStandard: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { created: 0, totalStandard: 0 };

  const { data: accountsByBankName, error: accountsByBankNameError } = await supabase
    .from('accounts')
    .select('id, bank_name')
    .eq('user_id', userId);

  let rows: AccountRow[] = [];
  if (!accountsByBankNameError) {
    rows = (accountsByBankName ?? []) as AccountRow[];
  } else {
    const { data: accountsByBank, error: accountsByBankError } = await supabase
      .from('accounts')
      .select('id, bank')
      .eq('user_id', userId);

    if (accountsByBankError) {
      throw accountsByBankError;
    }
    rows = (accountsByBank ?? []) as AccountRow[];
  }

  const existingStandardBanks = new Set<StandardBankName>();

  for (const row of rows) {
    const normalized = normalizeToStandardBankName(row.bank_name ?? row.bank);
    if (!normalized) continue;
    existingStandardBanks.add(normalized);

    const currentBankName = String(row.bank_name ?? '').trim();
    const currentBank = String(row.bank ?? '').trim();
    if (currentBankName !== normalized || currentBank !== normalized) {
      // eslint-disable-next-line no-await-in-loop
      await upsertBankLabels(row.id, normalized);
    }
  }

  let created = 0;
  for (const bankName of STANDARD_BANK_NAMES) {
    if (existingStandardBanks.has(bankName)) continue;
    // eslint-disable-next-line no-await-in-loop
    await insertStandardAccount(userId, bankName);
    created += 1;
  }

  return { created, totalStandard: STANDARD_BANK_NAMES.length };
};
