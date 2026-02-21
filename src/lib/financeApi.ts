import { getSupabaseClient } from './supabaseClient';
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
  amount: number;
  description: string | null;
  category: string | null;
  counterparty: string | null;
  commission: number;
  bank: string | null;
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

  const { data: transactionsData, error: txError } = await supabase
    .from('new_tranzakcii')
    .select('id, amount, description, category, counterparty, commission, bank, type, date')
    .eq('user_id', profileUserId)
    .gte('date', monthAgo.toISOString())
    .order('date', { ascending: false })
    .limit(120);

  if (txError) throw txError;

  return (transactionsData ?? []).map((tx) => {
    const amount = Number(tx.amount ?? 0);
    const description = tx.description ? String(tx.description) : null;
    const category = tx.category ? String(tx.category) : null;
    const counterparty = tx.counterparty ? String(tx.counterparty) : null;
    const commission = Number(tx.commission ?? 0);
    const kind = normalizeKind(String(tx.type ?? ''), amount);
    const bank = tx.bank ? String(tx.bank) : null;

    return {
      id: String(tx.id ?? crypto.randomUUID()),
      amount,
      description,
      category,
      counterparty,
      commission,
      bank,
      date: String(tx.date ?? ''),
      kind
    };
  });
};
