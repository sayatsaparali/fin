import { getSupabaseClient } from './supabaseClient';

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
    { id: 'demo-kaspi', bank: 'Kaspi.kz', balance: 1425000 },
    { id: 'demo-halyk', bank: 'Halyk Bank', balance: 845000 },
    { id: 'demo-freedom', bank: 'Freedom Bank', balance: 980000 }
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
  const { data: accountsByBankName, error: accountsByBankNameError } = await supabase
    .from('accounts')
    .select('id, bank, bank_name, balance')
    .eq('user_id', user.id);

  let accounts = accountsByBankName;
  if (accountsByBankNameError) {
    const { data: accountsByBank, error: accountsByBankError } = await supabase
      .from('accounts')
      .select('id, bank, balance')
      .eq('user_id', user.id);
    if (accountsByBankError) {
      throw accountsByBankError;
    }
    accounts = accountsByBank;
  }

  const normalizedAccounts: DashboardAccount[] = (accounts ?? []).map((acc) => ({
    id: String(acc.id ?? crypto.randomUUID()),
    bank: String(
      (acc as { bank_name?: string; bank?: string }).bank_name ??
        (acc as { bank?: string }).bank ??
        'Bank account'
    ),
    balance: Number(acc.balance ?? 0)
  }));

  const totalBalance = normalizedAccounts.reduce((acc, item) => acc + item.balance, 0);

  // 2. Транзакции за последнюю неделю для аналитики
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);

  const { data: transactionsByNewSchema, error: txNewSchemaError } = await supabase
    .from('transactions')
    .select('amount, type, date')
    .eq('user_id', user.id)
    .gte('date', weekAgo.toISOString())
    .order('date', { ascending: false })
    .limit(200);

  let normalizedTransactions: Array<{ amount: number; type: string; occurredAt: string }> = [];

  if (!txNewSchemaError) {
    normalizedTransactions = (transactionsByNewSchema ?? []).map((tx) => ({
      amount: Number(tx.amount ?? 0),
      type: String(tx.type ?? ''),
      occurredAt: String(tx.date ?? '')
    }));
  } else {
    const { data: transactionsLegacy, error: txLegacyError } = await supabase
      .from('transactions')
      .select('amount, type, occurred_at')
      .eq('user_id', user.id)
      .gte('occurred_at', weekAgo.toISOString())
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (txLegacyError) {
      throw txLegacyError;
    }

    normalizedTransactions = (transactionsLegacy ?? []).map((tx) => ({
      amount: Number(tx.amount ?? 0),
      type: String(tx.type ?? ''),
      occurredAt: String(tx.occurred_at ?? '')
    }));
  }

  const analyticsMap: Record<string, DailyAnalyticsPoint> = {};

  weekdayLabels.forEach((label) => {
    analyticsMap[label] = { name: label, income: 0, expense: 0 };
  });

  normalizedTransactions.forEach((tx) => {
    const date = new Date(tx.occurredAt);
    if (Number.isNaN(date.getTime()) || date < weekAgo) return;

    const dayIndex = date.getDay(); // 0 (Вс) - 6 (Сб)
    const label = weekdayLabels[dayIndex];

    const amount = tx.amount;
    const type = tx.type;

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

  const { data: transactionsRichSchema, error: txRichSchemaError } = await supabase
    .from('transactions')
    .select('id, amount, description, category, counterparty, commission, bank, type, date')
    .eq('user_id', user.id)
    .gte('date', monthAgo.toISOString())
    .order('date', { ascending: false })
    .limit(120);

  if (!txRichSchemaError) {
    return (transactionsRichSchema ?? []).map((tx) => {
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
  }

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
      const kind = normalizeKind(null, amount);

      return {
        id: String(tx.id ?? crypto.randomUUID()),
        amount,
        description: category,
        category,
        counterparty,
        commission: 0,
        bank: null,
        date: String(tx.date ?? ''),
        kind
      };
    });
  }

  // eslint-disable-next-line no-console
  console.log('Transactions new schema query failed, fallback applied:', txRichSchemaError?.message ?? txNewSchemaError.message);
  const { data: transactionsLegacy, error: txLegacyError } = await supabase
    .from('transactions')
    .select('id, amount, type, description, counterparty, commission, occurred_at, bank')
    .eq('user_id', user.id)
    .gte('occurred_at', monthAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(120);

  if (!txLegacyError) {
    return (transactionsLegacy ?? []).map((tx) => {
      const amount = Number(tx.amount ?? 0);
      const description = tx.description ? String(tx.description) : null;
      const category = tx.description ? String(tx.description) : tx.bank ? String(tx.bank) : null;
      const kind = normalizeKind(String(tx.type ?? ''), amount);
      return {
        id: String(tx.id ?? crypto.randomUUID()),
        amount,
        description,
        category,
        counterparty: tx.counterparty ? String(tx.counterparty) : null,
        commission: Number(tx.commission ?? 0),
        bank: tx.bank ? String(tx.bank) : null,
        date: String(tx.occurred_at ?? ''),
        kind
      };
    });
  }

  const { data: transactionsLegacyNoCommission, error: txLegacyNoCommissionError } = await supabase
    .from('transactions')
    .select('id, amount, type, description, counterparty, occurred_at, bank')
    .eq('user_id', user.id)
    .gte('occurred_at', monthAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(120);

  if (txLegacyNoCommissionError) {
    throw txLegacyNoCommissionError;
  }

  return (transactionsLegacyNoCommission ?? []).map((tx) => {
    const amount = Number(tx.amount ?? 0);
    const description = tx.description ? String(tx.description) : null;
    const category = tx.description ? String(tx.description) : tx.bank ? String(tx.bank) : null;
    const kind = normalizeKind(String(tx.type ?? ''), amount);
    return {
      id: String(tx.id ?? crypto.randomUUID()),
      amount,
      description,
      category,
      counterparty: tx.counterparty ? String(tx.counterparty) : null,
      commission: 0,
      bank: tx.bank ? String(tx.bank) : null,
      date: String(tx.occurred_at ?? ''),
      kind
    };
  });
};
