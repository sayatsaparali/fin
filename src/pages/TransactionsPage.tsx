import { useEffect, useState } from 'react';
import {
  fetchTransactionsHistory,
  type DashboardTransaction
} from '../lib/financeApi';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

const formatDateTime = (value: string) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const getTransactionLabel = (tx: DashboardTransaction) =>
  tx.counterparty ?? tx.category ?? 'Операция';

const getTransactionIcon = (tx: DashboardTransaction): { badge: string; tone: string } => {
  const label = (tx.category ?? tx.counterparty ?? '').toLowerCase();

  if (label.includes('taxi') || label.includes('yandex')) {
    return { badge: 'TX', tone: 'bg-sky-500/20 text-sky-300' };
  }
  if (label.includes('magnum') || label.includes('starbucks')) {
    return { badge: 'SH', tone: 'bg-violet-500/20 text-violet-300' };
  }
  if (label.includes('коммун') || label.includes('аренд')) {
    return { badge: 'HM', tone: 'bg-amber-500/20 text-amber-300' };
  }
  if (label.includes('app store')) {
    return { badge: 'AP', tone: 'bg-indigo-500/20 text-indigo-300' };
  }
  if (tx.kind === 'income') return { badge: 'IN', tone: 'bg-emerald-500/20 text-emerald-300' };
  if (tx.kind === 'expense') return { badge: 'EX', tone: 'bg-rose-500/20 text-rose-300' };
  return { badge: 'TR', tone: 'bg-slate-600/30 text-slate-300' };
};

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchTransactionsHistory();
        if (!isMounted) return;
        setTransactions(data);
      } catch (e) {
        if (!isMounted) return;
        setError('Не удалось загрузить историю транзакций.');
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">FinHub</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-100">Транзакции</h1>
        <p className="mt-1 text-xs text-slate-400">История операций за последние 30 дней</p>
      </section>

      {error && (
        <section className="glass-soft mt-4 border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </section>
      )}

      <section className="glass-panel mt-4 px-3 py-3 sm:px-5 sm:py-4">
        <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
          {transactions.map((tx) => {
            const isIncome = tx.kind === 'income';
            const isExpense = tx.kind === 'expense';
            const icon = getTransactionIcon(tx);
            const amountColor = isIncome
              ? 'text-emerald-300'
              : isExpense
                ? 'text-rose-300'
                : 'text-slate-200';
            const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';

            return (
              <article
                key={tx.id}
                className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-2.5 py-2 sm:px-3"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${icon.tone}`}
                  >
                    {icon.badge}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-100">
                      {getTransactionLabel(tx)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {formatDateTime(tx.date)} • {tx.category ?? 'Без категории'}
                    </p>
                  </div>

                  <p className={`shrink-0 text-right text-[13px] font-semibold ${amountColor}`}>
                    {amountPrefix}
                    {formatCurrency(Math.abs(tx.amount)).replace('KZT', '₸')}
                  </p>
                </div>
              </article>
            );
          })}

          {!loading && transactions.length === 0 && (
            <p className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-xs text-slate-400">
              В таблице `transactions` пока нет записей за последний месяц.
            </p>
          )}

          {loading && (
            <p className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-xs text-slate-400">
              Загрузка операций...
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default TransactionsPage;
