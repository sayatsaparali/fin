import { getSupabaseClient } from './supabaseClient';

export type DailyAnalyticsPoint = {
  name: string;
  income: number;
  expense: number;
};

export type DashboardData = {
  totalBalance: number;
  kaspiBalance: number;
  freedomBalance: number;
  halykBalance: number;
  analytics: DailyAnalyticsPoint[];
  transactions: DashboardTransaction[];
};

export type DashboardTransaction = {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer' | 'other';
  occurredAt: string;
  description: string | null;
  counterparty: string | null;
  bank: string | null;
};

const weekdayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

const buildFallbackData = (): DashboardData => ({
  totalBalance: 3250000,
  kaspiBalance: 1425000,
  freedomBalance: 980000,
  halykBalance: 845000,
  analytics: [
    { name: 'Пн', income: 180000, expense: 120000 },
    { name: 'Вт', income: 160000, expense: 140000 },
    { name: 'Ср', income: 150000, expense: 155000 },
    { name: 'Чт', income: 170000, expense: 130000 },
    { name: 'Пт', income: 200000, expense: 190000 },
    { name: 'Сб', income: 120000, expense: 135000 },
    { name: 'Вс', income: 110000, expense: 90000 }
  ],
  transactions: []
});

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const supabase = getSupabaseClient();

  // Если Supabase не настроен — возвращаем демо-данные
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

  // 1. Счета пользователя по банкам
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('bank, balance')
    .eq('user_id', user.id);

  if (accountsError) {
    throw accountsError;
  }

  let kaspiBalance = 0;
  let freedomBalance = 0;
  let halykBalance = 0;

  (accounts ?? []).forEach((acc) => {
    const bank = String(acc.bank ?? '').toLowerCase();
    const balance = Number(acc.balance ?? 0);

    if (bank === 'kaspi' || bank === 'kaspi gold') kaspiBalance += balance;
    if (bank === 'freedom' || bank === 'freedom bank') freedomBalance += balance;
    if (bank === 'halyk') halykBalance += balance;
  });

  const totalBalance = kaspiBalance + freedomBalance + halykBalance;

  // 2. Транзакции за последний месяц для списка и недельной аналитики
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, amount, type, occurred_at, description, counterparty, bank')
    .eq('user_id', user.id)
    .gte('occurred_at', monthAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(60);

  if (txError) {
    throw txError;
  }

  const analyticsMap: Record<string, DailyAnalyticsPoint> = {};

  weekdayLabels.forEach((label) => {
    analyticsMap[label] = { name: label, income: 0, expense: 0 };
  });

  (transactions ?? []).forEach((tx) => {
    const date = new Date(tx.occurred_at as string);
    if (Number.isNaN(date.getTime()) || date < weekAgo) return;

    const dayIndex = date.getDay(); // 0 (Вс) - 6 (Сб)
    const label = weekdayLabels[dayIndex];

    const amount = Number(tx.amount ?? 0);
    const type = String(tx.type);

    if (type === 'income') {
      analyticsMap[label].income += amount;
    } else if (type === 'expense') {
      analyticsMap[label].expense += amount;
    }
  });

  const analytics = weekdayLabels
    .filter((l) => l !== 'Вс')
    .concat(['Вс'])
    .map((label) => analyticsMap[label]);

  const normalizedTransactions: DashboardTransaction[] = (transactions ?? []).map((tx) => {
    const rawType = String(tx.type ?? 'other').toLowerCase();
    const normalizedType: DashboardTransaction['type'] =
      rawType === 'income' || rawType === 'expense' || rawType === 'transfer'
        ? rawType
        : 'other';

    return {
      id: String(tx.id ?? crypto.randomUUID()),
      amount: Number(tx.amount ?? 0),
      type: normalizedType,
      occurredAt: String(tx.occurred_at ?? ''),
      description: tx.description ? String(tx.description) : null,
      counterparty: tx.counterparty ? String(tx.counterparty) : null,
      bank: tx.bank ? String(tx.bank) : null
    };
  });

  return {
    totalBalance,
    kaspiBalance,
    freedomBalance,
    halykBalance,
    analytics,
    transactions: normalizedTransactions
  };
};
