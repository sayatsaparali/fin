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
};

export type DashboardTransaction = {
  id: string;
  amount: number;
  category: string | null;
  counterparty: string | null;
  date: string;
  kind: 'income' | 'expense' | 'other';
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
  ]
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

  // 2. Транзакции за последнюю неделю для аналитики
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('amount, type, occurred_at')
    .eq('user_id', user.id)
    .gte('occurred_at', weekAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(200);

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

  return {
    totalBalance,
    kaspiBalance,
    freedomBalance,
    halykBalance,
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

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  // Primary schema used by Transactions page: amount, category, counterparty, date
  const { data: transactionsByNewSchema, error: txNewSchemaError } = await supabase
    .from('transactions')
    .select('id, amount, category, counterparty, date')
    .eq('user_id', user.id)
    .gte('date', monthAgo.toISOString())
    .order('date', { ascending: false })
    .limit(120);

  if (!txNewSchemaError) {
    return (transactionsByNewSchema ?? []).map((tx) => {
      const amount = Number(tx.amount ?? 0);
      const category = tx.category ? String(tx.category) : null;
      const counterparty = tx.counterparty ? String(tx.counterparty) : null;
      const kind: DashboardTransaction['kind'] = amount < 0 ? 'expense' : 'income';

      return {
        id: String(tx.id ?? crypto.randomUUID()),
        amount,
        category,
        counterparty,
        date: String(tx.date ?? ''),
        kind
      };
    });
  }

  // Fallback for previous schema (type/description/occurred_at/bank) to avoid runtime errors
  // eslint-disable-next-line no-console
  console.log('Transactions new schema query failed, fallback applied:', txNewSchemaError.message);
  const { data: transactionsLegacy, error: txLegacyError } = await supabase
    .from('transactions')
    .select('id, amount, type, description, counterparty, occurred_at, bank')
    .eq('user_id', user.id)
    .gte('occurred_at', monthAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(120);

  if (txLegacyError) {
    throw txLegacyError;
  }

  return (transactionsLegacy ?? []).map((tx) => {
    const rawType = String(tx.type ?? 'other').toLowerCase();
    const kind: DashboardTransaction['kind'] =
      rawType === 'income' ? 'income' : rawType === 'expense' ? 'expense' : 'other';
    const category = tx.description ? String(tx.description) : tx.bank ? String(tx.bank) : null;
    return {
      id: String(tx.id ?? crypto.randomUUID()),
      amount: Number(tx.amount ?? 0),
      category,
      counterparty: tx.counterparty ? String(tx.counterparty) : null,
      date: String(tx.occurred_at ?? ''),
      kind
    };
  });
};
