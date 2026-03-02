import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightLeft, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getBankMeta } from '../lib/banks';
import type { UserAccount } from '../lib/accountsApi';

type SelectTarget = 'from' | 'to';

type OwnTransferBankSelectProps = {
  accounts: UserAccount[];
  fromAccountId: string;
  toAccountId: string;
  loading?: boolean;
  onFromChange: (accountId: string) => void;
  onToChange: (accountId: string) => void;
  onSwap: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

type AccountFieldButtonProps = {
  label: string;
  account: UserAccount | null;
  disabled?: boolean;
  onClick: () => void;
};

const AccountFieldButton = ({ label, account, disabled, onClick }: AccountFieldButtonProps) => {
  const bankMeta = getBankMeta(account?.bank);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border bg-[#0B101B] px-4 py-3 text-left transition min-h-14 touch-manipulation ${
        disabled
          ? 'cursor-not-allowed border-slate-800 text-slate-500'
          : 'border-emerald-400/35 text-slate-100 active:scale-[0.99]'
      }`}
    >
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <span className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${bankMeta.badgeTone}`}
          >
            {bankMeta.logo}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-100">
              {account?.bank ?? 'Выбрать банк'}
            </span>
            <span className="block truncate text-xs text-slate-400">
              {account ? formatBalance(account.balance).replace('KZT', '₸') : 'Нажмите для выбора'}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-[#39FF88]" />
      </span>
    </button>
  );
};

const OwnTransferBankSelect = ({
  accounts,
  fromAccountId,
  toAccountId,
  loading = false,
  onFromChange,
  onToChange,
  onSwap
}: OwnTransferBankSelectProps) => {
  const [target, setTarget] = useState<SelectTarget | null>(null);

  useEffect(() => {
    if (!target) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTarget(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target]);

  const fromAccount = useMemo(
    () => accounts.find((account) => account.id === fromAccountId) ?? null,
    [accounts, fromAccountId]
  );
  const toAccount = useMemo(
    () => accounts.find((account) => account.id === toAccountId) ?? null,
    [accounts, toAccountId]
  );

  const activeSelectionId = target === 'from' ? fromAccountId : toAccountId;
  const sheetTitle = target === 'from' ? 'Откуда' : 'Куда';

  const handleChoose = (accountId: string) => {
    if (target === 'from') {
      onFromChange(accountId);
    } else if (target === 'to') {
      onToChange(accountId);
    }
    setTarget(null);
  };

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-[#0B101B]/95 p-3 sm:p-4">
        <AccountFieldButton
          label="Откуда"
          account={fromAccount}
          disabled={loading || accounts.length === 0}
          onClick={() => setTarget('from')}
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onSwap}
            disabled={loading || accounts.length < 2}
            className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-[#39FF88]/60 bg-[#39FF88]/12 text-[#39FF88] shadow-lg shadow-emerald-500/20 transition hover:bg-[#39FF88]/18 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
            aria-label="Поменять банки местами"
          >
            <ArrowRightLeft size={18} />
          </button>
        </div>

        <AccountFieldButton
          label="Куда"
          account={toAccount}
          disabled={loading || accounts.length === 0}
          onClick={() => setTarget('to')}
        />

        {loading && (
          <p className="inline-flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Загрузка счетов...
          </p>
        )}
      </div>

      <AnimatePresence>
        {target && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/75"
              onClick={() => setTarget(null)}
              aria-label="Закрыть выбор банка"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative z-10 w-full rounded-t-3xl border border-emerald-500/25 bg-[#0B101B] pb-[calc(env(safe-area-inset-bottom,0px)+16px)] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-4"
            >
              <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-slate-600/80" />
              <div className="px-4 pb-3 pt-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{sheetTitle}</p>
                <p className="mt-1 text-base font-semibold text-slate-100">Выбрать банк</p>
              </div>

              <div className="max-h-[62vh] space-y-2 overflow-y-auto px-3">
                {accounts.map((account) => {
                  const bankMeta = getBankMeta(account.bank);
                  const isSelected = account.id === activeSelectionId;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleChoose(account.id)}
                      className={`flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-[#39FF88]/70 bg-[#39FF88]/10 text-emerald-100'
                          : 'border-slate-700 bg-slate-900/80 text-slate-200'
                      }`}
                    >
                      <span className="inline-flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${bankMeta.badgeTone}`}
                        >
                          {bankMeta.logo}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{account.bank}</span>
                          <span className="block truncate text-xs text-slate-400">
                            {`${account.bank} — ${formatBalance(account.balance).replace('KZT', '₸')}`}
                          </span>
                        </span>
                      </span>
                      {isSelected && <Check size={16} className="shrink-0 text-[#39FF88]" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default OwnTransferBankSelect;
