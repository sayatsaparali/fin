import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightLeft, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getBankMeta } from '../lib/banks';
import type { UserAccount } from '../lib/accountsApi';

export type BankSelectOption = {
  id: string;
  bank: string;
  balance?: number | null;
  subtitle?: string;
  disabled?: boolean;
};

type DualModeProps = {
  variant?: 'dual';
  accounts: UserAccount[];
  fromAccountId: string;
  toAccountId: string;
  loading?: boolean;
  onFromChange: (accountId: string) => void;
  onToChange: (accountId: string) => void;
  onSwap: () => void;
};

type SingleModeProps = {
  variant: 'single';
  label: string;
  options: BankSelectOption[];
  selectedId: string;
  onSelect: (optionId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  sheetTitle?: string;
  emptyText?: string;
};

type OwnTransferBankSelectProps = DualModeProps | SingleModeProps;

const formatBalance = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

const formatSecondaryLine = (option: BankSelectOption | null, fallback: string) => {
  if (!option) return fallback;
  if (option.subtitle) return option.subtitle;
  if (typeof option.balance === 'number' && Number.isFinite(option.balance)) {
    return formatBalance(option.balance).replace('KZT', '₸');
  }
  return 'Нажмите для выбора';
};

type BankSelectFieldProps = {
  label: string;
  options: BankSelectOption[];
  selectedId: string;
  onSelect: (optionId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  sheetTitle?: string;
  emptyText?: string;
};

const BankSelectField = ({
  label,
  options,
  selectedId,
  onSelect,
  loading = false,
  disabled = false,
  sheetTitle,
  emptyText = 'Нет доступных банков'
}: BankSelectFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedId) ?? null,
    [options, selectedId]
  );

  const canOpen = !disabled && !loading && options.length > 0;
  const selectedMeta = getBankMeta(selectedOption?.bank);

  const handleOpen = () => {
    if (!canOpen) return;
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur();
    setIsOpen(true);
  };

  const handleSelect = (optionId: string, optionDisabled = false) => {
    if (optionDisabled) return;
    onSelect(optionId);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!canOpen}
        className={`w-full min-h-14 touch-manipulation rounded-2xl border bg-[#0B101B] px-4 py-3 text-left transition ${
          canOpen
            ? 'border-emerald-400/35 text-slate-100 active:scale-[0.99]'
            : 'cursor-not-allowed border-slate-800 text-slate-500'
        }`}
      >
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {label}
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${selectedMeta.badgeTone}`}
            >
              {selectedMeta.logo}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-100">
                {selectedOption?.bank ?? 'Выбрать банк'}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {formatSecondaryLine(
                  selectedOption,
                  options.length > 0 ? 'Нажмите для выбора' : emptyText
                )}
              </span>
            </span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-[#39FF88]" />
        </span>
      </button>

      {loading && (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Загрузка счетов...
        </p>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/75"
              onClick={() => setIsOpen(false)}
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
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  {sheetTitle ?? label}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-100">Выбрать банк</p>
              </div>

              <div className="max-h-[62dvh] space-y-2 overflow-y-auto px-3">
                {options.map((option) => {
                  const bankMeta = getBankMeta(option.bank);
                  const isSelected = option.id === selectedId;
                  const optionDisabled = Boolean(option.disabled);
                  const rowSubtitle =
                    option.subtitle ??
                    (typeof option.balance === 'number' && Number.isFinite(option.balance)
                      ? `${option.bank} — ${formatBalance(option.balance).replace('KZT', '₸')}`
                      : option.bank);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelect(option.id, optionDisabled)}
                      disabled={optionDisabled}
                      className={`flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                        optionDisabled
                          ? 'cursor-not-allowed border-slate-800 bg-slate-900/70 text-slate-500'
                          : isSelected
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
                          <span className="block truncate text-sm font-medium">{option.bank}</span>
                          <span className="block truncate text-xs text-slate-400">{rowSubtitle}</span>
                        </span>
                      </span>
                      {isSelected && !optionDisabled && (
                        <Check size={16} className="shrink-0 text-[#39FF88]" />
                      )}
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

const OwnTransferBankSelect = (props: OwnTransferBankSelectProps) => {
  if (props.variant === 'single') {
    return (
      <BankSelectField
        label={props.label}
        options={props.options}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        loading={props.loading}
        disabled={props.disabled}
        sheetTitle={props.sheetTitle}
        emptyText={props.emptyText}
      />
    );
  }

  const options = useMemo<BankSelectOption[]>(
    () =>
      props.accounts.map((account) => ({
        id: account.id,
        bank: account.bank,
        balance: account.balance
      })),
    [props.accounts]
  );

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-[#0B101B]/95 p-3 sm:p-4">
      <BankSelectField
        label="Откуда"
        sheetTitle="Откуда"
        options={options}
        selectedId={props.fromAccountId}
        onSelect={props.onFromChange}
        loading={props.loading}
      />

      <div className="flex justify-center">
        <button
          type="button"
          onClick={props.onSwap}
          disabled={props.loading || props.accounts.length < 2}
          className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-[#39FF88]/60 bg-[#39FF88]/12 text-[#39FF88] shadow-lg shadow-emerald-500/20 transition hover:bg-[#39FF88]/18 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/70 disabled:text-slate-500"
          aria-label="Поменять банки местами"
        >
          <ArrowRightLeft size={18} />
        </button>
      </div>

      <BankSelectField
        label="Куда"
        sheetTitle="Куда"
        options={options}
        selectedId={props.toAccountId}
        onSelect={props.onToChange}
        loading={props.loading}
      />
    </div>
  );
};

export default OwnTransferBankSelect;
