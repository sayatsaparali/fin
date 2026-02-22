import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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

const formatTenge = (value: number) =>
  `${new Intl.NumberFormat('ru-KZ', {
    maximumFractionDigits: 0
  }).format(value)} Т`;

const formatSignedTenge = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatTenge(Math.abs(value))}`;

const formatIin = (value: string | null) => {
  if (!value) return '—';
  return value.trim();
};

const getVisualTip = (tx: DashboardTransaction): 'plus' | 'minus' | 'other' => {
  if (tx.tip === 'plus' || tx.tip === 'minus') return tx.tip;
  if (tx.kind === 'income') return 'plus';
  if (tx.kind === 'expense') return 'minus';
  return 'other';
};

const getDirectionDescription = (tx: DashboardTransaction) => {
  const tip = getVisualTip(tx);
  if (tip === 'plus') {
    return `Перевод от ${formatIin(tx.senderIin)}`;
  }
  if (tip === 'minus') {
    return `Перевод пользователю ${formatIin(tx.recipientIin)}`;
  }
  return tx.description ?? tx.counterparty ?? tx.category ?? 'Операция';
};

const getTransferSummary = (tx: DashboardTransaction) => {
  const tip = getVisualTip(tx);
  const senderBank = tx.senderBank ?? tx.bank ?? '—';
  const recipientBank = tx.recipientBank ?? '—';
  const balanceAfterText = tx.balanceAfter !== null ? formatTenge(tx.balanceAfter) : '—';
  const signedAmount =
    tip === 'plus' ? formatSignedTenge(Math.abs(tx.amount)) : tip === 'minus' ? formatSignedTenge(-Math.abs(tx.amount)) : formatSignedTenge(tx.amount);
  return `Перевод из [${senderBank}] в [${recipientBank}] | Сумма: ${signedAmount} | Остаток: ${balanceAfterText}`;
};

const getTransactionIcon = (
  tx: DashboardTransaction
): { icon: JSX.Element; tone: string } => {
  const tip = getVisualTip(tx);
  if (tip === 'plus') {
    return {
      icon: <ArrowUpRight size={14} />,
      tone: 'bg-emerald-500/20 text-emerald-300'
    };
  }
  if (tip === 'minus') {
    return {
      icon: <ArrowDownLeft size={14} />,
      tone: 'bg-rose-500/20 text-rose-300'
    };
  }

  const label = (tx.category ?? tx.counterparty ?? '').toLowerCase();

  if (label.includes('taxi') || label.includes('yandex')) {
    return { icon: <ArrowDownLeft size={14} />, tone: 'bg-sky-500/20 text-sky-300' };
  }
  if (label.includes('magnum') || label.includes('starbucks')) {
    return { icon: <ArrowDownLeft size={14} />, tone: 'bg-violet-500/20 text-violet-300' };
  }
  if (label.includes('коммун') || label.includes('аренд')) {
    return { icon: <ArrowDownLeft size={14} />, tone: 'bg-amber-500/20 text-amber-300' };
  }
  if (label.includes('app store')) {
    return { icon: <ArrowDownLeft size={14} />, tone: 'bg-indigo-500/20 text-indigo-300' };
  }
  if (tx.kind === 'income') {
    return { icon: <ArrowUpRight size={14} />, tone: 'bg-emerald-500/20 text-emerald-300' };
  }
  if (tx.kind === 'expense') {
    return { icon: <ArrowDownLeft size={14} />, tone: 'bg-rose-500/20 text-rose-300' };
  }
  return { icon: <ArrowDownLeft size={14} />, tone: 'bg-slate-600/30 text-slate-300' };
};

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async (withLoader = true) => {
      try {
        if (withLoader) setLoading(true);
        setError(null);
        const data = await fetchTransactionsHistory();
        if (!isMounted) return;
        setTransactions(data);
      } catch (e) {
        if (!isMounted) return;
        setError('Не удалось загрузить историю. Проверьте связку profile.id -> new_scheta.vladilec_id.');
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    const handleTransactionsUpdated = () => {
      load(false);
    };

    window.addEventListener('finhub:transactions-updated', handleTransactionsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('finhub:transactions-updated', handleTransactionsUpdated);
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
            const tip = getVisualTip(tx);
            const isIncome = tip === 'plus';
            const isExpense = tip === 'minus';
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
                    {icon.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium leading-5 text-slate-100">
                      {getTransferSummary(tx)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {getDirectionDescription(tx)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Отправитель: {formatIin(tx.senderIin)} ({tx.senderBank ?? '—'}) • Получатель:{' '}
                      {formatIin(tx.recipientIin)} ({tx.recipientBank ?? '—'}) •{' '}
                      Чистая сумма: {formatTenge(tx.cleanAmount)} •{' '}
                      {tx.commission > 0
                        ? `Комиссия: ${formatTenge(tx.commission)}`
                        : 'Без комиссии'}{' '}
                      • {formatDateTime(tx.date)}
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
              В таблице `new_tranzakcii` пока нет записей за последний месяц.
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
