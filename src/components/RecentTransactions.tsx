import { ArrowDownLeft, ArrowUpRight, Landmark, Zap } from 'lucide-react';
import { useMemo } from 'react';
import type { DashboardTransaction } from '../lib/financeApi';

// ─── types ────────────────────────────────────────────────────────────────

type Props = {
  transactions: DashboardTransaction[];
  loading?: boolean;
  onOpenAll?: () => void;
};

type Group = { label: string; items: DashboardTransaction[] };

// ─── formatters ──────────────────────────────────────────────────────────

const fmtCurrency = (value: number) =>
  `${new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(Math.abs(value))} ₸`;

const fmtTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
};

const fmtGroupLabel = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Без даты';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((today - txDay) / 86_400_000);

  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';

  const monthText = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date);
  return monthText.charAt(0).toUpperCase() + monthText.slice(1);
};

// ─── helpers ─────────────────────────────────────────────────────────────

const getTip = (tx: DashboardTransaction): 'plus' | 'minus' | 'other' => {
  if (tx.tip === 'plus') return 'plus';
  if (tx.tip === 'minus') return 'minus';
  if (tx.kind === 'income') return 'plus';
  if (tx.kind === 'expense') return 'minus';
  return 'other';
};

const getTitle = (tx: DashboardTransaction): string => {
  if (tx.counterparty?.trim()) return tx.counterparty.trim();
  const tip = getTip(tx);
  if (tip === 'plus') return 'Входящий перевод';
  if (tip === 'minus') return 'Исходящий перевод';
  return 'Перевод FinHub';
};

// ─── TransactionRow (compact card) ────────────────────────────────────────

const TransactionRow = ({ tx }: { tx: DashboardTransaction }) => {
  const tip = getTip(tx);
  const isIncome = tip === 'plus';
  const isExpense = tip === 'minus';

  const title = getTitle(tx);
  const bankName = tx.bank ?? tx.senderBank ?? tx.recipientBank ?? null;
  const commission = tx.commission ?? 0;
  const balanceAfter = tx.balanceAfter;

  const amountColor = isIncome
    ? 'text-emerald-400'
    : isExpense
      ? 'text-rose-400'
      : 'text-slate-200';

  const iconTone = isIncome
    ? 'bg-emerald-500/15 text-emerald-400'
    : isExpense
      ? 'bg-rose-500/15 text-rose-400'
      : 'bg-slate-700/50 text-slate-400';

  const amountPrefix = isIncome ? '+' : isExpense ? '−' : '';

  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/70 px-3 py-2.5 transition hover:border-slate-600/80">

      {/* Icon */}
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        {isIncome
          ? <ArrowDownLeft size={15} />
          : isExpense
            ? <ArrowUpRight size={15} />
            : <Zap size={14} />}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-100">{title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
          {bankName && (
            <>
              <Landmark size={8} />
              <span>{bankName}</span>
              <span>•</span>
            </>
          )}
          <span>{fmtTime(tx.date)}</span>
          {commission > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-500">ком. {fmtCurrency(commission)}</span>
            </>
          )}
          {balanceAfter !== null && balanceAfter !== undefined && (
            <>
              <span>•</span>
              <span>ост. {fmtCurrency(balanceAfter)}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <p className={`shrink-0 text-[14px] font-bold tabular-nums ${amountColor}`}>
        {amountPrefix}{fmtCurrency(Math.abs(tx.amount))}
      </p>
    </article>
  );
};

// ─── Component ────────────────────────────────────────────────────────────

const RecentTransactions = ({ transactions, loading = false, onOpenAll }: Props) => {
  const groups = useMemo<Group[]>(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const map = new Map<string, DashboardTransaction[]>();
    for (const tx of sorted) {
      const label = fmtGroupLabel(tx.date);
      const cur = map.get(label) ?? [];
      cur.push(tx);
      map.set(label, cur);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [transactions]);

  return (
    <section className="glass-panel px-4 py-4 sm:px-5 sm:py-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Последние операции
        </p>
        <button
          type="button"
          onClick={onOpenAll}
          className="min-h-9 rounded-lg px-2 text-xs font-medium text-emerald-400 transition hover:text-emerald-300"
        >
          Все операции →
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <p className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-3 text-xs text-slate-500 animate-pulse">
          Загрузка...
        </p>
      )}

      {/* Empty */}
      {!loading && groups.length === 0 && (
        <p className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-500">
          Здесь появятся ваши переводы
        </p>
      )}

      {/* Grouped rows */}
      {!loading && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                {group.label}
              </p>
              {group.items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;
