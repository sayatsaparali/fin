import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  ContactRound,
  CreditCard,
  QrCode,
  SendHorizontal
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';

type TransferMethod = 'own' | 'phone' | 'card';
type TransferScreen = 'menu' | 'form' | 'success';

type BankOption = {
  id: 'Kaspi' | 'Halyk' | 'Freedom' | 'BCC';
  name: string;
  logo: string;
  tone: string;
};

const bankOptions: BankOption[] = [
  { id: 'Kaspi', name: 'Kaspi', logo: 'K', tone: 'bg-rose-500/20 text-rose-300' },
  { id: 'Halyk', name: 'Halyk', logo: 'H', tone: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'Freedom', name: 'Freedom', logo: 'F', tone: 'bg-lime-500/20 text-lime-300' },
  { id: 'BCC', name: 'BCC', logo: 'B', tone: 'bg-sky-500/20 text-sky-300' }
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

const formatPhoneValue = (input: string) => {
  let digits = input.replace(/\D/g, '');

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  if (digits.startsWith('7') && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (digits.length > 0 && !digits.startsWith('7')) {
    digits = `7${digits}`;
  }

  digits = digits.slice(0, 10);

  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);

  let result = '+7';
  if (p1) result += ` (${p1}`;
  if (p1.length === 3) result += ')';
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;

  return result;
};

const getPhoneDigits = (value: string) => value.replace(/\D/g, '').slice(-10);

const formatCardValue = (input: string) =>
  input
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const PaymentsPage = () => {
  const navigate = useNavigate();

  const [screen, setScreen] = useState<TransferScreen>('menu');
  const [method, setMethod] = useState<TransferMethod>('own');

  const [fromBank, setFromBank] = useState<BankOption['id']>('Kaspi');
  const [toBank, setToBank] = useState<BankOption['id']>('Halyk');
  const [targetBank, setTargetBank] = useState<BankOption['id']>('Halyk');

  const [phone, setPhone] = useState('+7');
  const [cardNumber, setCardNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);

  const amountValue = Number(amount || 0);

  const commission = useMemo(() => {
    if (amountValue <= 0) return 0;
    if (method === 'own') return 0;
    if (method === 'phone') return 500;
    return Math.round(amountValue * 0.0095);
  }, [amountValue, method]);

  const totalDebit = Math.max(0, amountValue + commission);

  const openMethodForm = (nextMethod: TransferMethod) => {
    setMethod(nextMethod);
    setError(null);
    setScreen('form');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (amountValue <= 0) {
      setError('Введите сумму перевода больше 0.');
      return;
    }

    if (method === 'own' && fromBank === toBank) {
      setError('Для перевода между своими счетами выберите разные банки.');
      return;
    }

    if (method === 'phone' && getPhoneDigits(phone).length !== 10) {
      setError('Введите номер в формате +7 (7xx) xxx-xx-xx.');
      return;
    }

    if (method === 'card' && cardNumber.replace(/\s/g, '').length !== 16) {
      setError('Введите корректный номер карты из 16 цифр.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase не настроен. Проверьте переменные окружения.');
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw userError ?? new Error('Пользователь не найден.');
      }

      const { data: sourceAccount, error: sourceError } = await supabase
        .from('accounts')
        .select('id, balance, bank')
        .eq('user_id', user.id)
        .eq('bank', fromBank)
        .maybeSingle();

      if (sourceError || !sourceAccount) {
        throw sourceError ?? new Error(`Счет ${fromBank} не найден.`);
      }

      const sourceBalance = Number(sourceAccount.balance ?? 0);
      if (sourceBalance < totalDebit) {
        setError('Недостаточно средств на выбранном счете.');
        return;
      }

      if (method === 'own') {
        const { data: destinationAccount, error: destinationError } = await supabase
          .from('accounts')
          .select('id, balance, bank')
          .eq('user_id', user.id)
          .eq('bank', toBank)
          .maybeSingle();

        if (destinationError || !destinationAccount) {
          throw destinationError ?? new Error(`Счет ${toBank} не найден.`);
        }

        const sourceNewBalance = sourceBalance - totalDebit;
        const destinationNewBalance = Number(destinationAccount.balance ?? 0) + amountValue;

        const { error: updateSourceError } = await supabase
          .from('accounts')
          .update({ balance: sourceNewBalance })
          .eq('id', sourceAccount.id);

        if (updateSourceError) throw updateSourceError;

        const { error: updateDestinationError } = await supabase
          .from('accounts')
          .update({ balance: destinationNewBalance })
          .eq('id', destinationAccount.id);

        if (updateDestinationError) throw updateDestinationError;
      } else {
        const sourceNewBalance = sourceBalance - totalDebit;
        const { error: updateSourceError } = await supabase
          .from('accounts')
          .update({ balance: sourceNewBalance })
          .eq('id', sourceAccount.id);

        if (updateSourceError) throw updateSourceError;
      }

      window.dispatchEvent(new Event('finhub:accounts-updated'));
      setSuccessMessage(
        `Перевод успешно выполнен. Списано ${formatCurrency(totalDebit).replace('KZT', '₸')}.`
      );
      setScreen('success');

      setAmount('');
      setComment('');
      setPhone('+7');
      setCardNumber('');
    } catch (submitError) {
      // eslint-disable-next-line no-console
      console.error(submitError);
      setError('Не удалось выполнить перевод. Проверьте данные и попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">FinHub</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-100">Переводы</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsQrOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400"
          >
            <QrCode size={16} />
            FinHub QR
          </button>
        </div>

        <AnimatePresence mode="wait">
          {screen === 'menu' && (
            <motion.section
              key="menu"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <button
                type="button"
                onClick={() => openMethodForm('own')}
                className="glass-soft flex items-center gap-3 p-4 text-left transition hover:border-emerald-400/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <ArrowRightLeft size={18} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-100">Между своими счетами</p>
                  <p className="text-xs text-slate-400">Мгновенно и без комиссии</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openMethodForm('phone')}
                className="glass-soft flex items-center gap-3 p-4 text-left transition hover:border-emerald-400/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
                  <ContactRound size={18} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-100">По номеру телефона</p>
                  <p className="text-xs text-slate-400">Фиксированная комиссия 500 ₸</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openMethodForm('card')}
                className="glass-soft flex items-center gap-3 p-4 text-left transition hover:border-emerald-400/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                  <CreditCard size={18} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-100">По номеру карты</p>
                  <p className="text-xs text-slate-400">Комиссия 0.95%</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4 text-left transition hover:bg-emerald-500/15"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <QrCode size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-200">FinHub QR</p>
                  <p className="text-xs text-emerald-100/80">Сканировать QR для оплаты</p>
                </div>
              </button>
            </motion.section>
          )}

          {screen === 'form' && (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setScreen('menu');
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
              >
                <ArrowLeft size={14} /> Назад к способам перевода
              </button>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">Счет списания</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {bankOptions.map((bank) => (
                    <button
                      key={bank.id}
                      type="button"
                      onClick={() => setFromBank(bank.id)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                        fromBank === bank.id
                          ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bank.tone}`}>
                        {bank.logo}
                      </span>
                      <span>{bank.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {method === 'own' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Счет зачисления</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {bankOptions.map((bank) => (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => setToBank(bank.id)}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                          toBank === bank.id
                            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                            : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bank.tone}`}>
                          {bank.logo}
                        </span>
                        <span>{bank.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {method === 'phone' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300" htmlFor="phone">Номер телефона</label>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneValue(e.target.value))}
                      placeholder="+7 (7xx) xxx-xx-xx"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Банк получателя</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {bankOptions.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setTargetBank(bank.id)}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                            targetBank === bank.id
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bank.tone}`}>
                            {bank.logo}
                          </span>
                          <span>{bank.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {method === 'card' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300" htmlFor="cardNumber">Номер карты</label>
                  <input
                    id="cardNumber"
                    type="text"
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardValue(e.target.value))}
                    placeholder="0000 0000 0000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="amount">Сумма, ₸</label>
                <input
                  id="amount"
                  type="number"
                  min={1}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5000"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                />
                <p className="text-xs text-slate-400">
                  Комиссия:{' '}
                  <span className="font-medium text-slate-200">
                    {formatCurrency(commission).replace('KZT', '₸')}
                  </span>
                </p>
                <p className="text-xs text-slate-500">К списанию: {formatCurrency(totalDebit).replace('KZT', '₸')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="comment">Комментарий (необязательно)</label>
                <input
                  id="comment"
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Перевод FinHub"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50 disabled:cursor-not-allowed disabled:bg-emerald-700/50"
              >
                <SendHorizontal size={16} />
                {isSubmitting ? 'Отправка...' : 'Подтвердить перевод'}
              </button>
            </motion.form>
          )}

          {screen === 'success' && (
            <motion.section
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4 text-center"
            >
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 16 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
              >
                <CheckCircle2 size={34} />
              </motion.div>

              <div>
                <p className="text-lg font-semibold text-emerald-200">Перевод успешно выполнен</p>
                <p className="mt-1 text-sm text-slate-300">{successMessage}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                >
                  Вернуться на главную
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage('');
                    setScreen('menu');
                  }}
                  className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-400"
                >
                  Новый перевод
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {isQrOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-sm p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-100">FinHub QR Scanner</p>
                <button
                  type="button"
                  onClick={() => setIsQrOpen(false)}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  Закрыть
                </button>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-slate-900/90 p-6">
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-emerald-400/70">
                  <Camera className="text-emerald-300" size={30} />
                </div>
                <motion.div
                  initial={{ y: -30 }}
                  animate={{ y: 250 }}
                  transition={{ repeat: Infinity, repeatType: 'reverse', duration: 1.8, ease: 'easeInOut' }}
                  className="absolute left-8 right-8 h-1 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]"
                />
              </div>

              <p className="mt-3 text-xs text-slate-400">Наведите камеру на QR-код для оплаты или перевода.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentsPage;
