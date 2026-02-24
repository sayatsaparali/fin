import { getSupabaseClient, isSchemaRelatedError } from './supabaseClient';
import { getAuthUserWithRetry } from './authSession';
import { resolveRequiredProfileIdByAuthUserId } from './profileIdentity';
import { fetchAccountsByProfileId } from './accountsApi';

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
  tip: 'plus' | 'minus' | 'other';
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

const asTextOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

type ResolvedUserIdentity = {
  profileId: string;
  iin: string;
};

const resolveCurrentUserIdentity = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  authUserId: string
): Promise<ResolvedUserIdentity> => {
  const profileId = await resolveRequiredProfileIdByAuthUserId(supabase, authUserId);
  let iin: string | null = profileId;

  const { data: profileData, error: profileError } = await supabase
    .from('new_polzovateli')
    .select('iin')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError && !isSchemaRelatedError(profileError)) {
    throw profileError;
  }

  if (!profileError) {
    iin = asTextOrNull((profileData as { iin?: string | null } | null)?.iin) ?? profileId;
  }

  if (!profileId || !iin) {
    throw new Error('В new_polzovateli не найден профиль для текущего auth.user.id.');
  }

  return { profileId, iin };
};

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return buildFallbackData();
  }

  const user = await getAuthUserWithRetry(supabase);
  const { profileId: profileUserId, iin: ownerIin } = await resolveCurrentUserIdentity(
    supabase,
    user.id
  );

  // 1. Счета из new_scheta (единая логика с PaymentsPage)
  const normalizedAccounts: DashboardAccount[] = await fetchAccountsByProfileId(
    supabase,
    profileUserId
  );

  const totalBalance = normalizedAccounts.reduce((acc, item) => acc + item.balance, 0);

  // 2. Транзакции за неделю из new_tranzakcii
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);

  const parseAnalyticsSelect = async (
    selectClause: string,
    ownerColumn: 'vladilec_id' | 'user_id',
    ownerValue: string
  ) =>
    supabase
      .from('new_tranzakcii')
      .select(selectClause)
      .eq(ownerColumn, ownerValue)
      .gte('date', weekAgo.toISOString())
      .order('date', { ascending: false })
      .limit(200);

  let transactionsData: Array<Record<string, unknown>> | null = null;
  let txError: unknown = null;

  try {
    const primaryResult = await parseAnalyticsSelect('amount, type, tip, date', 'vladilec_id', ownerIin);
    transactionsData = primaryResult.data as Array<Record<string, unknown>> | null;
    txError = primaryResult.error;

    if (txError && isSchemaRelatedError(txError as { code?: string; message?: string })) {
      const fallbackResult = await parseAnalyticsSelect(
        'amount, type, date',
        'user_id',
        profileUserId
      );
      transactionsData = fallbackResult.data as Array<Record<string, unknown>> | null;
      txError = fallbackResult.error;
    }
  } catch (analyticsError) {
    txError = analyticsError;
  }

  const normalizedTransactions: Array<{ amount: number; type: string; tip: string; occurredAt: string }> = [];

  if (!txError) {
    for (const tx of transactionsData ?? []) {
      normalizedTransactions.push({
        amount: Number(tx.amount ?? 0),
        type: String(tx.type ?? ''),
        tip: String(tx.tip ?? ''),
        occurredAt: String(tx.date ?? '')
      });
    }
  } else {
    // eslint-disable-next-line no-console
    console.error('Dashboard analytics load failed. Returning accounts without analytics.', txError);
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
    const amount = Math.abs(tx.amount);
    const type = tx.type;
    const tip = tx.tip.toLowerCase();

    if (tip === 'plus' || type === 'income') {
      analyticsMap[label].income += amount;
    } else if (tip === 'minus' || type === 'expense') {
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

  const user = await getAuthUserWithRetry(supabase);
  const { profileId: profileUserId, iin: ownerIin } = await resolveCurrentUserIdentity(
    supabase,
    user.id
  );

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

  const normalizeTip = (
    rawTip: string | null | undefined,
    rawType: string | null | undefined,
    amount: number
  ): DashboardTransaction['tip'] => {
    const tip = String(rawTip ?? '').toLowerCase();
    if (tip === 'plus') return 'plus';
    if (tip === 'minus') return 'minus';

    const type = String(rawType ?? '').toLowerCase();
    if (type === 'income') return 'plus';
    if (type === 'expense') return 'minus';

    if (amount > 0) return 'plus';
    if (amount < 0) return 'minus';
    return 'other';
  };

  const asNumberOrNull = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const normalizeBankKey = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

  const parseSelectResult = async (
    selectClause: string,
    ownerColumn: 'vladilec_id' | 'user_id',
    ownerValue: string
  ) =>
    supabase
      .from('new_tranzakcii')
      .select(selectClause)
      .eq(ownerColumn, ownerValue)
      .gte('date', monthAgo.toISOString())
      .order('date', { ascending: false })
      .limit(120);

  const baseSelect = 'id, vladilec_id, user_id, amount, description, category, counterparty, commission, bank, type, tip, date';
  const fallbackBaseSelect = 'id, user_id, amount, description, category, counterparty, commission, bank, type, date';
  const extendedSelect = `${baseSelect}, sender_iin, sender_bank, recipient_iin, recipient_bank, clean_amount, balance_after`;

  let { data: transactionsData, error: txError } = await parseSelectResult(
    extendedSelect,
    'vladilec_id',
    ownerIin
  );

  if (txError && isSchemaRelatedError(txError)) {
    const fallbackResult = await parseSelectResult(fallbackBaseSelect, 'user_id', profileUserId);
    transactionsData = fallbackResult.data;
    txError = fallbackResult.error;
  }

  if (txError) throw txError;

  // Привязка к владельцу счетов по profile.id (для таблицы new_scheta),
  // а транзакции фильтруются по vladilec_id = IIN.
  // Здесь считаем остаток после операции, если balance_after не хранится в записи.
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

    const amountRaw = Number(txRecord.amount ?? 0);
    const commission = Number(txRecord.commission ?? 0);
    const tip = normalizeTip(asTextOrNull(txRecord.tip), asTextOrNull(txRecord.type), amountRaw);
    const amount =
      tip === 'minus'
        ? -Math.abs(amountRaw)
        : tip === 'plus'
          ? Math.abs(amountRaw)
          : amountRaw;
    const kind =
      tip === 'plus'
        ? 'income'
        : tip === 'minus'
          ? 'expense'
          : normalizeKind(asTextOrNull(txRecord.type), amount);

    const description = asTextOrNull(txRecord.description);
    const category = asTextOrNull(txRecord.category);
    const counterparty = asTextOrNull(txRecord.counterparty);
    const bank = asTextOrNull(txRecord.bank);

    const senderIin = asTextOrNull(txRecord.sender_iin) ?? (kind === 'expense' ? ownerIin : null);
    const recipientIin =
      asTextOrNull(txRecord.recipient_iin) ?? (kind === 'income' ? ownerIin : null);
    const senderBank = asTextOrNull(txRecord.sender_bank) ?? (kind === 'expense' ? bank : null);
    const recipientBank = asTextOrNull(txRecord.recipient_bank) ?? (kind === 'income' ? bank : null);

    const cleanAmountFromRow = asNumberOrNull(txRecord.clean_amount);
    const cleanAmount =
      cleanAmountFromRow !== null
        ? Math.abs(cleanAmountFromRow)
        : tip === 'minus' || kind === 'expense'
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
      userId: asTextOrNull(txRecord.vladilec_id) ?? asTextOrNull(txRecord.user_id),
      tip,
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
