import { getSupabaseClient, isSchemaRelatedError } from './supabaseClient';
import { resolveRequiredProfileIdByAuthUserId } from './profileIdentity';

export type DailyAnalyticsPoint = {
  name: string;
  income: number;
  expense: number;
};

export type DashboardData = {
  totalBalance: number;
  accounts: DashboardAccount[];
  analytics: DailyAnalyticsPoint[];
};

export type DashboardAccount = {
  id: string;
  bank: string;
  balance: number;
};

export type DashboardTransaction = {
  id: string;
  userId: string | null;
  amount: number;
  cleanAmount: number;
  description: string | null;
  category: string | null;
  counterparty: string | null;
  commission: number;
  bank: string | null;
  senderIin: string | null;
  senderBank: string | null;
  recipientIin: string | null;
  recipientBank: string | null;
  balanceAfter: number | null;
  date: string;
  kind: 'income' | 'expense' | 'other';
};

const weekdayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

const buildFallbackData = (): DashboardData => ({
  totalBalance: 3250000,
  accounts: [
    { id: 'demo-kaspi', bank: 'Kaspi Bank', balance: 1425000 },
    { id: 'demo-halyk', bank: 'Halyk Bank', balance: 845000 },
    { id: 'demo-bcc', bank: 'BCC Bank', balance: 980000 }
  ],
  analytics: [
    { name: 'Пн', income: 180000, expense: 120000 },
    { name: 'Вт', income: 160000, expense: 140000 },
    { name: 'Ср', income: 150000, expense: 155000 },
    { name: 'Чт', income: 170000, expense: 130000 },
    { name: 'Пт', income: 200000, expense: 190000 },
    { name: 'Сб', income: 120000, expense: 135000 },
    { name: 'Вс', income: 110000, expense: 90000 }
  ]
});

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return buildFallbackData();
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError ?? new Error('Пользователь не найден.');
  }
  const profileUserId = await resolveRequiredProfileIdByAuthUserId(supabase, user.id);

  // 1. Счета из new_scheta
  const { data: accountsData, error: accountsError } = await supabase
    .from('new_scheta')
    .select('id, nazvanie_banka, balans')
    .eq('vladilec_id', profileUserId);

  if (accountsError) throw accountsError;

  const normalizedAccounts: DashboardAccount[] = (accountsData ?? []).map((acc) => ({
    id: String(acc.id ?? crypto.randomUUID()),
    bank: String((acc as { nazvanie_banka?: string }).nazvanie_banka ?? 'Bank account'),
    balance: Number((acc as { balans?: number }).balans ?? 0)
  }));

  const totalBalance = normalizedAccounts.reduce((acc, item) => acc + item.balance, 0);

  // 2. Транзакции за неделю из new_tranzakcii
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);

  const { data: transactionsData, error: txError } = await supabase
    .from('new_tranzakcii')
    .select('amount, type, date')
    .eq('user_id', profileUserId)
    .gte('date', weekAgo.toISOString())
    .order('date', { ascending: false })
    .limit(200);

  const normalizedTransactions: Array<{ amount: number; type: string; occurredAt: string }> = [];

  if (!txError) {
    for (const tx of transactionsData ?? []) {
      normalizedTransactions.push({
        amount: Number(tx.amount ?? 0),
        type: String(tx.type ?? ''),
        occurredAt: String(tx.date ?? '')
      });
    }
  }

  const analyticsMap: Record<string, DailyAnalyticsPoint> = {};
  weekdayLabels.forEach((label) => {
    analyticsMap[label] = { name: label, income: 0, expense: 0 };
  });

  normalizedTransactions.forEach((tx) => {
    const date = new Date(tx.occurredAt);
    if (Number.isNaN(date.getTime()) || date < weekAgo) return;

    const dayIndex = date.getDay();
    const label = weekdayLabels[dayIndex];
    const amount = tx.amount;
    const type = tx.type;

    if (type === 'income') {
      analyticsMap[label].income += amount;
    } else if (type === 'expense') {
      analyticsMap[label].expense += amount;
    }
  });

  const analytics = ([...weekdayLabels] as string[])
    .filter((l) => l !== 'Вс')
    .concat(['Вс'])
    .map((label) => analyticsMap[label]);

  return {
    totalBalance,
    accounts: normalizedAccounts,
    analytics
  };
};

export const fetchTransactionsHistory = async (): Promise<DashboardTransaction[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError ?? new Error('Пользователь не найден.');
  }
  const profileUserId = await resolveRequiredProfileIdByAuthUserId(supabase, user.id);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const normalizeKind = (
    rawType: string | null | undefined,
    amount: number
  ): DashboardTransaction['kind'] => {
    const type = String(rawType ?? '').toLowerCase();
    if (type === 'income') return 'income';
    if (type === 'expense') return 'expense';
    if (amount < 0) return 'expense';
    if (amount > 0) return 'income';
    return 'other';
  };

  const asTextOrNull = (value: unknown): string | null => {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
  };

  const asNumberOrNull = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const normalizeBankKey = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

  const parseSelectResult = async (selectClause: string) =>
    supabase
      .from('new_tranzakcii')
      .select(selectClause)
      .eq('user_id', profileUserId)
      .gte('date', monthAgo.toISOString())
      .order('date', { ascending: false })
      .limit(120);

  const baseSelect = 'id, user_id, amount, description, category, counterparty, commission, bank, type, date';
  const extendedSelect = `${baseSelect}, sender_iin, sender_bank, recipient_iin, recipient_bank, clean_amount, balance_after`;

  let { data: transactionsData, error: txError } = await parseSelectResult(extendedSelect);

  if (txError && isSchemaRelatedError(txError)) {
    const fallbackResult = await parseSelectResult(baseSelect);
    transactionsData = fallbackResult.data;
    txError = fallbackResult.error;
  }

  if (txError) throw txError;

  // Привязка к владельцу счетов: используем vladilec_id = profile.id
  // для вычисления остатка после операции, если balance_after не хранится в записи.
  const { data: accountsData, error: accountsError } = await supabase
    .from('new_scheta')
    .select('nazvanie_banka, balans')
    .eq('vladilec_id', profileUserId);

  const runningBalanceByBank = new Map<string, number>();
  if (accountsError) {
    // eslint-disable-next-line no-console
    console.error('Failed to load account balances for history fallback:', accountsError);
  } else {
    for (const account of accountsData ?? []) {
      const bankName = asTextOrNull((account as { nazvanie_banka?: string | null }).nazvanie_banka);
      const balance = asNumberOrNull((account as { balans?: number | null }).balans);
      if (!bankName || balance === null) continue;
      runningBalanceByBank.set(normalizeBankKey(bankName), balance);
    }
  }

  const result: DashboardTransaction[] = [];

  for (const tx of transactionsData ?? []) {
    const txRecord = tx as Record<string, unknown>;

    const amount = Number(txRecord.amount ?? 0);
    const commission = Number(txRecord.commission ?? 0);
    const kind = normalizeKind(asTextOrNull(txRecord.type), amount);

    const description = asTextOrNull(txRecord.description);
    const category = asTextOrNull(txRecord.category);
    const counterparty = asTextOrNull(txRecord.counterparty);
    const bank = asTextOrNull(txRecord.bank);

    const senderIin = asTextOrNull(txRecord.sender_iin) ?? (kind === 'expense' ? profileUserId : null);
    const recipientIin =
      asTextOrNull(txRecord.recipient_iin) ?? (kind === 'income' ? profileUserId : null);
    const senderBank = asTextOrNull(txRecord.sender_bank) ?? (kind === 'expense' ? bank : null);
    const recipientBank = asTextOrNull(txRecord.recipient_bank) ?? (kind === 'income' ? bank : null);

    const cleanAmountFromRow = asNumberOrNull(txRecord.clean_amount);
    const cleanAmount =
      cleanAmountFromRow !== null
        ? Math.abs(cleanAmountFromRow)
        : kind === 'expense'
          ? Math.max(0, Math.abs(amount) - Math.max(0, commission))
          : Math.abs(amount);

    let balanceAfter = asNumberOrNull(txRecord.balance_after);
    const balanceBankName = senderBank ?? recipientBank ?? bank;
    const balanceBankKey = normalizeBankKey(balanceBankName);

    if (balanceAfter === null && balanceBankKey && runningBalanceByBank.has(balanceBankKey)) {
      const currentBalance = runningBalanceByBank.get(balanceBankKey) ?? 0;
      balanceAfter = currentBalance;
      runningBalanceByBank.set(balanceBankKey, currentBalance - amount);
    } else if (balanceAfter !== null && balanceBankKey) {
      runningBalanceByBank.set(balanceBankKey, balanceAfter - amount);
    }

    result.push({
      id: String(txRecord.id ?? crypto.randomUUID()),
      userId: asTextOrNull(txRecord.user_id),
      amount,
      cleanAmount,
      description,
      category,
      counterparty,
      commission,
      bank,
      senderIin,
      senderBank,
      recipientIin,
      recipientBank,
      balanceAfter,
      date: String(txRecord.date ?? ''),
      kind
    });
  }

  return result;
};
