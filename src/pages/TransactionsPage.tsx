import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Landmark, Zap } from 'lucide-react';
import {
  fetchTransactionsHistory,
  type DashboardTransaction
} from '../lib/financeApi';

// ─── formatters ────────────────────────────────────────────────────────────

const fmtMoney = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    maximumFractionDigits: 0
  }).format(Math.abs(value));

const fmtCurrency = (value: number) =>
  `${fmtMoney(value)} ₸`;

const fmtDateTime = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const fmtDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без даты';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((today - txDay) / 86_400_000);

  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long' }).format(date);
};

// ─── helpers ───────────────────────────────────────────────────────────────

const getTip = (tx: DashboardTransaction): 'plus' | 'minus' | 'other' => {
  if (tx.tip === 'plus') return 'plus';
  if (tx.tip === 'minus') return 'minus';
  if (tx.kind === 'income') return 'plus';
  if (tx.kind === 'expense') return 'minus';
  return 'other';
};

const getTitle = (tx: DashboardTransaction): string => {
  if (tx.counterparty && tx.counterparty.trim()) return tx.counterparty.trim();
  const tip = getTip(tx);
  if (tip === 'plus') return 'Входящий перевод';
  if (tip === 'minus') return 'Исходящий перевод';
  return 'Перевод FinHub';
};

const getDescription = (tx: DashboardTransaction): string | null => {
  if (tx.description && tx.description.trim()) return tx.description.trim();
  return null;
};

// ─── TransactionCard ───────────────────────────────────────────────────────

const TransactionCard = ({ tx }: { tx: DashboardTransaction }) => {
  const tip = getTip(tx);
  const isIncome = tip === 'plus';
  const isExpense = tip === 'minus';

  const title = getTitle(tx);
  const desc = getDescription(tx);
  const bankName = tx.bank ?? tx.senderBank ?? tx.recipientBank ?? null;
  const cleanAmt = tx.cleanAmount ?? Math.abs(tx.amount);
  const commission = tx.commission ?? 0;
  const balanceAfter = tx.balanceAfter;

  const amountColor = isIncome
    ? 'text-emerald-400'
    : isExpense
      ? 'text-rose-400'
      : 'text-slate-200';

  const iconTone = isIncome
    ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
    : isExpense
      ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20'
      : 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/30';

  const amountPrefix = isIncome ? '+' : isExpense ? '−' : '';

  return (
    <article className="group rounded-2xl border border-slate-700/60 bg-slate-900/75 px-4 py-3 transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/90">
      <div className="flex items-start gap-3">

        {/* Icon */}
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
          {isIncome
            ? <ArrowDownLeft size={16} />
            : isExpense
              ? <ArrowUpRight size={16} />
              : <Zap size={15} />}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          {/* Row 1: title + amount */}
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[13px] font-semibold leading-5 text-slate-100">
              {title}
            </p>
            <p className={`shrink-0 text-[14px] font-bold leading-5 tabular-nums ${amountColor}`}>
              {amountPrefix}{fmtCurrency(Math.abs(tx.amount))}
            </p>
          </div>

          {/* Row 2: description */}
          {desc && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {desc}
            </p>
          )}

          {/* Row 3: meta chips */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">

            {/* Bank */}
            {bankName && (
              <span className="flex items-center gap-1 rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                <Landmark size={9} />
                {bankName}
              </span>
            )}

            {/* Clean amount (if differs from total) */}
            {commission > 0 && (
              <span className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                Чистая: {fmtCurrency(cleanAmt)}
              </span>
            )}

            {/* Commission */}
            {commission > 0 && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 ring-1 ring-amber-500/20">
                Комиссия {fmtCurrency(commission)}
              </span>
            )}

            {/* Balance after */}
            {balanceAfter !== null && balanceAfter !== undefined && (
              <span className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-500">
                Остаток: {fmtCurrency(balanceAfter)}
              </span>
            )}

            {/* Date */}
            <span className="ml-auto text-[10px] text-slate-600">
              {fmtDateTime(tx.date)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
};

// ─── Group header ──────────────────────────────────────────────────────────

type Group = { label: string; items: DashboardTransaction[] };

const groupByDate = (txs: DashboardTransaction[]): Group[] => {
  const sorted = [...txs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const map = new Map<string, DashboardTransaction[]>();
  for (const tx of sorted) {
    const label = fmtDate(tx.date);
    const cur = map.get(label) ?? [];
    cur.push(tx);
    map.set(label, cur);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
};

// ─── Page ──────────────────────────────────────────────────────────────────

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
        const msg = e instanceof Error ? e.message : String((e as { message?: string } | null)?.message ?? '');
        setError(msg ? `Ошибка загрузки: ${msg}` : 'Не удалось загрузить историю. Проверьте RLS-политики.');
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    const handler = () => { load(false); };
    window.addEventListener('finhub:transactions-updated', handler);
    return () => { isMounted = false; window.removeEventListener('finhub:transactions-updated', handler); };
  }, []);

  const groups = groupByDate(transactions);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">

      {/* Header */}
      <section className="glass-panel px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">FinHub</p>
        <h1 className="mt-0.5 text-xl font-bold text-slate-100">История операций</h1>
        <p className="mt-0.5 text-xs text-slate-500">Последние 30 дней</p>
      </section>

      {/* Error */}
      {error && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </section>
      )}

      {/* Loading */}
      {loading && (
        <section className="glass-panel px-5 py-6 text-center">
          <p className="text-xs text-slate-500 animate-pulse">Загрузка операций...</p>
        </section>
      )}

      {/* Empty */}
      {!loading && !error && transactions.length === 0 && (
        <section className="glass-panel px-5 py-8 text-center">
          <p className="text-sm text-slate-500">Нет операций за последние 30 дней</p>
          <p className="mt-1 text-xs text-slate-600">Совершите первый перевод, чтобы увидеть историю</p>
        </section>
      )}

      {/* Groups */}
      {!loading && groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
            {group.label}
          </p>
          {group.items.map((tx) => <TransactionCard key={tx.id} tx={tx} />)}
        </section>
      ))}

    </div>
  );
};

export default TransactionsPage;
