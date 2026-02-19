import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  ContactRound,
  CreditCard,
  Plus,
  QrCode,
  SendHorizontal,
  Star
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import FrequentTransfersStrip from '../components/FrequentTransfersStrip';
import { BankId, getBankMeta, KZ_BANKS, normalizeBankId } from '../lib/banks';
import {
  addFavoriteContact,
  fetchFavoriteContacts,
  removeFavoriteContact,
  type FavoriteCategory,
  type FavoriteContact,
  type NewFavoriteContactInput
} from '../lib/favoritesApi';
import { getSupabaseClient } from '../lib/supabaseClient';

type TransferMethod = 'own' | 'phone' | 'card';
type TransferScreen = 'menu' | 'form' | 'success';

type ConnectedAccount = {
  id: string;
  bank: string;
  balance: number;
};

type TransferLocationState = {
  quickFavorite?: FavoriteContact;
  openAddFavorite?: boolean;
};

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

const normalizePhoneDigits = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/\D/g, '')
    .replace(/^8/, '7')
    .slice(-10);

type ProfileLookupRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
};

const PaymentsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const transferState = (location.state ?? null) as TransferLocationState | null;

  const [screen, setScreen] = useState<TransferScreen>('menu');
  const [method, setMethod] = useState<TransferMethod>('own');

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteContact[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [ownPhoneDigits, setOwnPhoneDigits] = useState('');
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [isRecipientLookupLoading, setIsRecipientLookupLoading] = useState(false);

  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [recipientBankId, setRecipientBankId] = useState<BankId>('halyk');

  const [phone, setPhone] = useState('+7');
  const [cardNumber, setCardNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');

  const [monthlySmpUsed, setMonthlySmpUsed] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [lastTransferDraft, setLastTransferDraft] = useState<NewFavoriteContactInput | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  const [newFavoriteName, setNewFavoriteName] = useState('');
  const [newFavoriteCategory, setNewFavoriteCategory] = useState<FavoriteCategory>('phone');
  const [newFavoriteBankName, setNewFavoriteBankName] = useState(KZ_BANKS[0].name);
  const [newFavoriteValue, setNewFavoriteValue] = useState('');
  const [newFavoriteAvatar, setNewFavoriteAvatar] = useState('');

  const amountValue = Number(amount || 0);

  useEffect(() => {
    let isMounted = true;

    const loadAccounts = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        setAccountsLoading(true);
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError ?? new Error('Пользователь не найден.');
        }
        setAuthUserId(user.id);

        const { data: rows, error: accountsError } = await supabase
          .from('accounts')
          .select('id, bank, balance')
          .eq('user_id', user.id)
          .order('bank', { ascending: true });

        if (accountsError) {
          throw accountsError;
        }

        if (!isMounted) return;

        const normalized: ConnectedAccount[] = (rows ?? []).map((row) => ({
          id: String(row.id),
          bank: String(row.bank ?? 'Bank'),
          balance: Number(row.balance ?? 0)
        }));

        setAccounts(normalized);
        setFromAccountId((prev) => prev || normalized[0]?.id || '');
        setToAccountId((prev) => prev || normalized[1]?.id || normalized[0]?.id || '');

        const { data: ownProfile } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', user.id)
          .maybeSingle();
        setOwnPhoneDigits(normalizePhoneDigits((ownProfile as { phone_number?: string } | null)?.phone_number));
      } catch (loadError) {
        // eslint-disable-next-line no-console
        console.error('Failed to load accounts for transfers:', loadError);
      } finally {
        if (isMounted) setAccountsLoading(false);
      }
    };

    loadAccounts();

    const refreshHandler = () => {
      loadAccounts();
    };

    window.addEventListener('finhub:accounts-updated', refreshHandler);
    return () => {
      isMounted = false;
      window.removeEventListener('finhub:accounts-updated', refreshHandler);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const lookupRecipientByPhone = async () => {
      if (method !== 'phone') return;

      const digits = getPhoneDigits(phone);
      if (digits.length !== 10) {
        if (!isMounted) return;
        setRecipientName(null);
        setRecipientUserId(null);
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        setIsRecipientLookupLoading(true);

        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, phone_number')
          .not('phone_number', 'is', null);

        if (error) throw error;
        if (!isMounted) return;

        const matched = (data as ProfileLookupRow[] | null)?.find(
          (profile) => normalizePhoneDigits(profile.phone_number) === digits
        );

        if (!matched) {
          setRecipientName(null);
          setRecipientUserId(null);
          return;
        }

        const fullName = `${matched.first_name ?? ''} ${matched.last_name ?? ''}`.trim();
        setRecipientName(fullName || 'Получатель FinHub');
        setRecipientUserId(matched.id);
      } catch (lookupError) {
        // eslint-disable-next-line no-console
        console.error('Recipient lookup failed:', lookupError);
      } finally {
        if (isMounted) setIsRecipientLookupLoading(false);
      }
    };

    lookupRecipientByPhone();

    return () => {
      isMounted = false;
    };
  }, [method, phone]);

  useEffect(() => {
    if (method !== 'phone') {
      setRecipientName(null);
      setRecipientUserId(null);
      setIsRecipientLookupLoading(false);
    }
  }, [method]);

  useEffect(() => {
    if (transferState?.quickFavorite) {
      applyFavoriteTransfer(transferState.quickFavorite);
      navigate(location.pathname, { replace: true, state: null });
    }

    if (transferState?.openAddFavorite) {
      setIsFavoriteModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, transferState]);

  useEffect(() => {
    let isMounted = true;

    const loadFavorites = async () => {
      try {
        setFavoritesLoading(true);
        const data = await fetchFavoriteContacts();
        if (!isMounted) return;
        setFavorites(data);
      } catch (favoritesError) {
        if (!isMounted) return;
        // eslint-disable-next-line no-console
        console.error('Failed to load favorites on transfers:', favoritesError);
      } finally {
        if (isMounted) setFavoritesLoading(false);
      }
    };

    loadFavorites();

    const refreshHandler = () => {
      loadFavorites();
    };
    window.addEventListener('finhub:favorites-updated', refreshHandler);

    return () => {
      isMounted = false;
      window.removeEventListener('finhub:favorites-updated', refreshHandler);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMonthlySmpVolume = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) return;

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { data: newSchemaData, error: newSchemaError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('category', 'SMP_PHONE_TRANSFER')
          .gte('date', monthStart.toISOString());

        if (!newSchemaError) {
          const total = (newSchemaData ?? []).reduce((acc, row) => acc + Math.abs(Number(row.amount ?? 0)), 0);
          if (isMounted) setMonthlySmpUsed(total);
          return;
        }

        const { data: legacyData, error: legacyError } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('description', 'SMP_PHONE_TRANSFER')
          .gte('occurred_at', monthStart.toISOString());

        if (legacyError) throw legacyError;

        const total = (legacyData ?? []).reduce((acc, row) => acc + Math.abs(Number(row.amount ?? 0)), 0);
        if (isMounted) setMonthlySmpUsed(total);
      } catch (volumeError) {
        // eslint-disable-next-line no-console
        console.error('Failed to load monthly SMP volume:', volumeError);
      }
    };

    loadMonthlySmpVolume();

    return () => {
      isMounted = false;
    };
  }, []);

  const sourceAccount = accounts.find((account) => account.id === fromAccountId) ?? null;
  const destinationAccount = accounts.find((account) => account.id === toAccountId) ?? null;

  const sourceBankId = normalizeBankId(sourceAccount?.bank);

  const applyFavoriteTransfer = (favorite: FavoriteContact) => {
    setError(null);
    setRecipientName(null);
    setRecipientUserId(null);

    const targetBankId = normalizeBankId(favorite.bank_name);
    setRecipientBankId(targetBankId === 'unknown' ? 'halyk' : targetBankId);

    if (favorite.category === 'card') {
      setMethod('card');
      setCardNumber(formatCardValue(favorite.phone_number));
    } else if (favorite.category === 'own') {
      setMethod('own');
    } else {
      setMethod('phone');
      setPhone(formatPhoneValue(favorite.phone_number));
      setRecipientName(favorite.name);
    }

    setComment(`Перевод: ${favorite.name}`);
    setAmount('');
    setScreen('form');
  };

  const handleCreateFavorite = async () => {
    const normalizedValue =
      newFavoriteCategory === 'card'
        ? newFavoriteValue.replace(/\D/g, '').slice(0, 16)
        : `+7${newFavoriteValue.replace(/\D/g, '').slice(-10)}`;

    if (!newFavoriteName.trim()) {
      setError('Введите имя контакта.');
      return;
    }

    if (newFavoriteCategory === 'card' && normalizedValue.length !== 16) {
      setError('Введите корректный номер карты из 16 цифр.');
      return;
    }

    if (newFavoriteCategory === 'phone' && normalizedValue.length < 12) {
      setError('Введите корректный номер телефона.');
      return;
    }

    try {
      const created = await addFavoriteContact({
        name: newFavoriteName.trim(),
        phone_number: normalizedValue,
        bank_name: newFavoriteBankName,
        avatar_url: newFavoriteAvatar.trim() || null,
        category: newFavoriteCategory
      });
      setFavorites((prev) => [created, ...prev]);
      window.dispatchEvent(new Event('finhub:favorites-updated'));
      setIsFavoriteModalOpen(false);
      setNewFavoriteName('');
      setNewFavoriteValue('');
      setNewFavoriteAvatar('');
      setNewFavoriteCategory('phone');
      setError(null);
    } catch (createError) {
      // eslint-disable-next-line no-console
      console.error('Failed to create favorite:', createError);
      setError('Не удалось добавить контакт в избранное.');
    }
  };

  const handleDeleteFavorite = async (favorite: FavoriteContact) => {
    try {
      await removeFavoriteContact(favorite.id);
      setFavorites((prev) => prev.filter((item) => item.id !== favorite.id));
      window.dispatchEvent(new Event('finhub:favorites-updated'));
    } catch (deleteError) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete favorite:', deleteError);
      setError('Не удалось удалить контакт из избранного.');
    }
  };

  const saveLastTransferToFavorites = async () => {
    if (!lastTransferDraft) return;
    try {
      setIsSavingFavorite(true);
      const created = await addFavoriteContact(lastTransferDraft);
      setFavorites((prev) => [created, ...prev]);
      window.dispatchEvent(new Event('finhub:favorites-updated'));
      setSuccessMessage('Контакт добавлен в избранное.');
      setLastTransferDraft(null);
    } catch (saveError) {
      // eslint-disable-next-line no-console
      console.error('Failed to save transfer to favorites:', saveError);
      setError('Не удалось сохранить контакт в избранном.');
    } finally {
      setIsSavingFavorite(false);
    }
  };

  const commission = useMemo(() => {
    if (amountValue <= 0) return 0;

    if (method === 'own') {
      return 0;
    }

    if (method === 'phone') {
      if (sourceBankId === recipientBankId) return 0;
      const projectedMonthVolume = monthlySmpUsed + amountValue;
      if (projectedMonthVolume <= 500000) return 0;
      return Math.max(Math.round(amountValue * 0.005), 250);
    }

    if (sourceBankId === recipientBankId) {
      return 0;
    }

    if (sourceBankId === 'kaspi') {
      return Math.max(Math.round(amountValue * 0.0095), 200);
    }

    if (sourceBankId === 'halyk') {
      return amountValue <= 40000 ? 150 : Math.round(amountValue * 0.0095);
    }

    if (sourceBankId === 'bcc' || sourceBankId === 'freedom') {
      return Math.max(Math.round(amountValue * 0.007), 250);
    }

    return Math.max(Math.round(amountValue * 0.007), 250);
  }, [amountValue, method, sourceBankId, recipientBankId, monthlySmpUsed]);

  const totalDebit = Math.max(0, amountValue + commission);
  const insufficientFunds = Boolean(sourceAccount && totalDebit > sourceAccount.balance);

  const openMethodForm = (nextMethod: TransferMethod) => {
    setMethod(nextMethod);
    setError(null);
    setScreen('form');
  };

  const commissionText = commission === 0 ? 'Без комиссии' : `Комиссия: ${formatCurrency(commission).replace('KZT', '₸')}`;

  const createTransactionRecord = async (params: {
    userId: string;
    amount: number;
    category: string;
    counterparty: string;
    bankName: string;
    kind: 'income' | 'expense';
  }) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const nowIso = new Date().toISOString();

    const { error: newSchemaError } = await supabase.from('transactions').insert({
      user_id: params.userId,
      amount: params.amount,
      category: params.category,
      counterparty: params.counterparty,
      date: nowIso
    });

    if (!newSchemaError) {
      return;
    }

    const { error: legacyError } = await supabase.from('transactions').insert({
      user_id: params.userId,
      amount: params.amount,
      type: params.kind,
      description: params.category,
      counterparty: params.counterparty,
      occurred_at: nowIso,
      bank: params.bankName
    });

    if (legacyError) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert transaction record:', {
        newSchemaError,
        legacyError
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceAccount) {
      setError('Выберите счет списания.');
      return;
    }

    if (amountValue <= 0) {
      setError('Введите сумму перевода больше 0.');
      return;
    }

    if (insufficientFunds) {
      setError('Недостаточно средств');
      return;
    }

    if (method === 'own') {
      if (!destinationAccount) {
        setError('Выберите счет зачисления.');
        return;
      }
      if (sourceAccount.id === destinationAccount.id) {
        setError('Для перевода между своими счетами выберите разные счета.');
        return;
      }
    }

    if (method === 'phone' && getPhoneDigits(phone).length !== 10) {
      setError('Введите номер в формате +7 (7xx) xxx-xx-xx.');
      return;
    }

    if (method === 'phone') {
      const enteredPhoneDigits = getPhoneDigits(phone);
      if (
        (ownPhoneDigits && enteredPhoneDigits === ownPhoneDigits) ||
        (recipientUserId && authUserId && recipientUserId === authUserId)
      ) {
        setError('Нельзя перевести деньги самому себе по номеру телефона.');
        return;
      }
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
      if (!authUserId) {
        throw new Error('Не удалось определить пользователя для операции.');
      }

      const sourceNewBalance = sourceAccount.balance - totalDebit;

      const { error: updateSourceError } = await supabase
        .from('accounts')
        .update({ balance: sourceNewBalance })
        .eq('id', sourceAccount.id);

      if (updateSourceError) throw updateSourceError;

      if (method === 'own' && destinationAccount) {
        const destinationNewBalance = destinationAccount.balance + amountValue;

        const { error: updateDestinationError } = await supabase
          .from('accounts')
          .update({ balance: destinationNewBalance })
          .eq('id', destinationAccount.id);

        if (updateDestinationError) throw updateDestinationError;

        setAccounts((prev) =>
          prev.map((account) => {
            if (account.id === sourceAccount.id) return { ...account, balance: sourceNewBalance };
            if (account.id === destinationAccount.id) return { ...account, balance: destinationNewBalance };
            return account;
          })
        );

        await createTransactionRecord({
          userId: authUserId,
          amount: -totalDebit,
          category: 'OWN_TRANSFER_OUT',
          counterparty: destinationAccount.bank,
          bankName: sourceAccount.bank,
          kind: 'expense'
        });
        await createTransactionRecord({
          userId: authUserId,
          amount: amountValue,
          category: 'OWN_TRANSFER_IN',
          counterparty: sourceAccount.bank,
          bankName: destinationAccount.bank,
          kind: 'income'
        });
      } else {
        setAccounts((prev) =>
          prev.map((account) =>
            account.id === sourceAccount.id ? { ...account, balance: sourceNewBalance } : account
          )
        );

        const transferCategory = method === 'phone' ? 'SMP_PHONE_TRANSFER' : 'CARD_TRANSFER';
        const transferCounterparty =
          method === 'phone'
            ? recipientName ?? `Телефон ${phone.slice(-4)}`
            : `Карта ${cardNumber.replace(/\D/g, '').slice(-4)}`;

        await createTransactionRecord({
          userId: authUserId,
          amount: -totalDebit,
          category: transferCategory,
          counterparty: transferCounterparty,
          bankName: sourceAccount.bank,
          kind: 'expense'
        });
      }

      if (method === 'phone' && sourceBankId !== recipientBankId) {
        setMonthlySmpUsed((prev) => prev + amountValue);
      }

      window.dispatchEvent(new Event('finhub:accounts-updated'));

      setSuccessMessage(
        `Перевод успешно выполнен. Списано ${formatCurrency(totalDebit).replace('KZT', '₸')}.`
      );
      setScreen('success');
      if (method === 'phone' || method === 'card') {
        const draftValue =
          method === 'phone'
            ? `+7${getPhoneDigits(phone)}`
            : cardNumber.replace(/\D/g, '').slice(0, 16);

        if (draftValue) {
          const recipientMeta = KZ_BANKS.find((bank) => bank.id === recipientBankId);
          setLastTransferDraft({
            name:
              method === 'phone'
                ? recipientName ?? `Контакт ${phone.slice(-4)}`
                : `Карта ${draftValue.slice(-4)}`,
            phone_number: draftValue,
            bank_name: recipientMeta?.name ?? destinationBankMeta.name,
            avatar_url: null,
            category: method
          });
        }
      } else {
        setLastTransferDraft(null);
      }

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

  const destinationBankMeta =
    method === 'own' ? getBankMeta(destinationAccount?.bank) : getBankMeta(KZ_BANKS.find((bank) => bank.id === recipientBankId)?.name);
  const sourceBankMeta = getBankMeta(sourceAccount?.bank);

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
              className="space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
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
                  </div>
                </button>
              </div>

              <FrequentTransfersStrip
                title="Частые переводы"
                favorites={favorites}
                loading={favoritesLoading}
                onAdd={() => setIsFavoriteModalOpen(true)}
                onSelect={applyFavoriteTransfer}
                onDelete={handleDeleteFavorite}
              />
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
                <label className="text-xs font-medium text-slate-300">Откуда</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {accounts.map((account) => {
                    const bankMeta = getBankMeta(account.bank);
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setFromAccountId(account.id)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                          fromAccountId === account.id
                            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                            : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bankMeta.badgeTone}`}>
                            {bankMeta.logo}
                          </span>
                          <span>{account.bank}</span>
                        </span>
                        <span>{formatCurrency(account.balance).replace('KZT', '₸')}</span>
                      </button>
                    );
                  })}
                </div>
                {accountsLoading && <p className="text-xs text-slate-500">Загрузка счетов...</p>}
              </div>

              {method === 'own' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Куда</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {accounts.map((account) => {
                      const bankMeta = getBankMeta(account.bank);
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setToAccountId(account.id)}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                            toAccountId === account.id
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bankMeta.badgeTone}`}>
                              {bankMeta.logo}
                            </span>
                            <span>{account.bank}</span>
                          </span>
                          <span>{formatCurrency(account.balance).replace('KZT', '₸')}</span>
                        </button>
                      );
                    })}
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
                    {isRecipientLookupLoading && getPhoneDigits(phone).length === 10 && (
                      <p className="text-xs text-slate-400">Поиск получателя...</p>
                    )}
                    {!isRecipientLookupLoading && recipientName && (
                      <p className="text-xs text-emerald-300">Получатель: {recipientName}</p>
                    )}
                    {!isRecipientLookupLoading && getPhoneDigits(phone).length === 10 && !recipientName && (
                      <p className="text-xs text-slate-500">
                        Контакт не найден в FinHub. Перевод будет отправлен по реквизитам банка.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Банк получателя</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {KZ_BANKS.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setRecipientBankId(bank.id)}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                            recipientBankId === bank.id
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bank.badgeTone}`}>
                            {bank.logo}
                          </span>
                          <span>{bank.shortName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {method === 'card' && (
                <>
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

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Банк получателя</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {KZ_BANKS.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setRecipientBankId(bank.id)}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                            recipientBankId === bank.id
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bank.badgeTone}`}>
                            {bank.logo}
                          </span>
                          <span>{bank.shortName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
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
                <p className="text-xs text-slate-400">{commissionText}</p>
                <p className="text-xs text-slate-500">К списанию: {formatCurrency(totalDebit).replace('KZT', '₸')}</p>
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-xs text-slate-300">
                <p className="mb-2 font-medium text-slate-100">Подтверждение перевода</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${sourceBankMeta.badgeTone}`}>
                      {sourceBankMeta.logo}
                    </span>
                    <span>{sourceAccount?.bank ?? '—'}</span>
                  </span>
                  <span>→</span>
                  <span className="inline-flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${destinationBankMeta.badgeTone}`}>
                      {destinationBankMeta.logo}
                    </span>
                    <span>{method === 'own' ? destinationAccount?.bank ?? '—' : destinationBankMeta.shortName}</span>
                  </span>
                </div>
                {method === 'phone' && recipientName && (
                  <p className="mt-2 text-[11px] text-emerald-300">Получатель: {recipientName}</p>
                )}
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

              {insufficientFunds && <p className="text-xs text-rose-300">Недостаточно средств</p>}
              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  accountsLoading ||
                  accounts.length === 0 ||
                  !sourceAccount ||
                  (method === 'own' && !destinationAccount) ||
                  insufficientFunds
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50 disabled:cursor-not-allowed disabled:bg-emerald-700/50"
              >
                <SendHorizontal size={16} />
                {isSubmitting ? 'Отправка...' : 'Перевести'}
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
                {lastTransferDraft && (
                  <button
                    type="button"
                    onClick={saveLastTransferToFavorites}
                    disabled={isSavingFavorite}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Star size={14} />
                    {isSavingFavorite ? 'Сохранение...' : 'Добавить в избранное'}
                  </button>
                )}
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
                    setLastTransferDraft(null);
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
        {isFavoriteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="glass-panel w-full max-w-md p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-100">Новый избранный контакт</p>
                <button
                  type="button"
                  onClick={() => setIsFavoriteModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  Закрыть
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Имя контакта</label>
                  <input
                    type="text"
                    value={newFavoriteName}
                    onChange={(e) => setNewFavoriteName(e.target.value)}
                    placeholder="Например, Арман"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Тип контакта</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewFavoriteCategory('phone')}
                      className={`rounded-xl px-3 py-2 text-xs transition ${
                        newFavoriteCategory === 'phone'
                          ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                          : 'border border-slate-700 bg-slate-900/70 text-slate-300'
                      }`}
                    >
                      По телефону
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFavoriteCategory('card')}
                      className={`rounded-xl px-3 py-2 text-xs transition ${
                        newFavoriteCategory === 'card'
                          ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                          : 'border border-slate-700 bg-slate-900/70 text-slate-300'
                      }`}
                    >
                      По карте
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">
                    {newFavoriteCategory === 'card' ? 'Номер карты' : 'Номер телефона'}
                  </label>
                  <input
                    type="text"
                    value={newFavoriteValue}
                    onChange={(e) =>
                      setNewFavoriteValue(
                        newFavoriteCategory === 'card'
                          ? formatCardValue(e.target.value)
                          : formatPhoneValue(e.target.value)
                      )
                    }
                    placeholder={
                      newFavoriteCategory === 'card'
                        ? '0000 0000 0000 0000'
                        : '+7 (7xx) xxx-xx-xx'
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Банк</label>
                  <select
                    value={newFavoriteBankName}
                    onChange={(e) => setNewFavoriteBankName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  >
                    {KZ_BANKS.map((bank) => (
                      <option key={bank.id} value={bank.name}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">URL аватарки (необязательно)</label>
                  <input
                    type="url"
                    value={newFavoriteAvatar}
                    onChange={(e) => setNewFavoriteAvatar(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCreateFavorite}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400"
                >
                  <Plus size={16} />
                  Добавить контакт
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
