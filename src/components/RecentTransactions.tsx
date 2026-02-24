import { ArrowDownLeft, ArrowUpRight, Building2 } from 'lucide-react';
import { useMemo } from 'react';
import type { DashboardTransaction } from '../lib/financeApi';

type RecentTransactionsProps = {
  transactions: DashboardTransaction[];
  loading?: boolean;
  onOpenAll?: () => void;
};

type GroupedTransactions = {
  label: string;
  items: DashboardTransaction[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatMonthLabel = (value: Date) => {
  const text = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const getGroupLabel = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Без даты';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - txDay) / 86400000);

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return formatMonthLabel(date);
};

const normalizeTip = (tx: DashboardTransaction): 'plus' | 'minus' | 'other' => {
  if (tx.tip === 'plus' || tx.tip === 'minus') return tx.tip;
  if (tx.kind === 'income') return 'plus';
  if (tx.kind === 'expense') return 'minus';
  return 'other';
};

const getTitle = (tx: DashboardTransaction, tip: 'plus' | 'minus' | 'other') => {
  if (tip === 'plus') return tx.description ?? `Перевод от ${tx.senderIin ?? 'клиента FinHub'}`;
  if (tip === 'minus')
    return tx.description ?? `Перевод пользователю ${tx.recipientIin ?? 'клиента FinHub'}`;
  return tx.description ?? tx.counterparty ?? tx.category ?? 'Операция';
};

const getSubtitle = (tx: DashboardTransaction) => {
  const fromBank = tx.senderBank ?? tx.bank ?? '—';
  const toBank = tx.recipientBank ?? tx.bank ?? '—';
  return `${fromBank} → ${toBank}`;
};

const RecentTransactions = ({ transactions, loading = false, onOpenAll }: RecentTransactionsProps) => {
  const groupedTransactions = useMemo<GroupedTransactions[]>(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const groups = new Map<string, DashboardTransaction[]>();
    for (const tx of sorted) {
      const label = getGroupLabel(tx.date);
      const current = groups.get(label) ?? [];
      current.push(tx);
      groups.set(label, current);
    }

    return Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items
    }));
  }, [transactions]);

  return (
    <section className="glass-panel px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Последние транзакции</p>
        <button
          type="button"
          onClick={onOpenAll}
          className="min-h-11 rounded-xl px-3 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
        >
          Все операции
        </button>
      </div>

      {loading && (
        <p className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-xs text-slate-400">
          Загрузка последних транзакций...
        </p>
      )}

      {!loading && groupedTransactions.length === 0 && (
        <p className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-xs text-slate-400">
          Операции появятся здесь после первого перевода.
        </p>
      )}

      {!loading && groupedTransactions.length > 0 && (
        <div className="space-y-4">
          {groupedTransactions.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {group.label}
              </p>
              {group.items.map((tx) => {
                const tip = normalizeTip(tx);
                const isIncome = tip === 'plus';
                const isExpense = tip === 'minus';
                const iconTone = isIncome
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : isExpense
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-slate-700/60 text-slate-300';
                const amountTone = isIncome
                  ? 'text-emerald-300'
                  : isExpense
                    ? 'text-rose-300'
                    : 'text-slate-200';
                const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';

                return (
                  <article
                    key={tx.id}
                    className="rounded-2xl border border-slate-700/70 bg-slate-900/65 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}
                      >
                        {isIncome ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-100">
                          {getTitle(tx, tip)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {getSubtitle(tx)} • {formatTime(tx.date)}
                        </p>
                        {tx.commission > 0 && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-300">
                            <Building2 size={12} />
                            Комиссия {formatCurrency(tx.commission).replace('KZT', '₸')}
                          </p>
                        )}
                      </div>

                      <p className={`shrink-0 text-sm font-semibold ${amountTone}`}>
                        {amountPrefix}
                        {formatCurrency(Math.abs(tx.amount)).replace('KZT', '₸')}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;

