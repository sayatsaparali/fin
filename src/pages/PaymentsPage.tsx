import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  ContactRound,
  CreditCard,
  Loader2,
  Plus,
  QrCode,
  SendHorizontal,
  Star
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import FrequentTransfersStrip from '../components/FrequentTransfersStrip';
import { BankId, getBankMeta, normalizeBankId } from '../lib/banks';
import {
  addFavoriteContact,
  fetchFavoriteContacts,
  removeFavoriteContact,
  type FavoriteCategory,
  type FavoriteContact,
  type NewFavoriteContactInput
} from '../lib/favoritesApi';
import { ensureStandardAccountsForUser } from '../lib/accountsInitializer';
import { extractKzPhoneDigits, formatKzPhoneFromDigits, toKzE164Phone } from '../lib/phone';
import {
  extractProfileIdFromAccountId,
  findProfileByAccountId,
  resolveRequiredProfileIdByAuthUserId
} from '../lib/profileIdentity';
import {
  normalizeToStandardBankName,
  STANDARD_BANK_NAMES,
  type StandardBankName
} from '../lib/standardBanks';
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

const formatCardValue = (input: string) =>
  input
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();

type ProfileLookupRow = {
  id: string;
  imya: string | null;
  familiya: string | null;
  nomer_telefona: string | null;
};

type RecipientAccount = {
  id: string;
  bank: string;
};

const mapRecipientBankToDbName = (bankId: BankId): StandardBankName => {
  if (bankId === 'kaspi') return 'Kaspi Bank';
  if (bankId === 'halyk') return 'Halyk Bank';
  if (bankId === 'bcc') return 'BCC Bank';
  return 'Halyk Bank';
};

const STANDARD_TRANSFER_BANK_OPTIONS: Array<{ id: BankId; name: StandardBankName }> = [
  { id: 'kaspi', name: 'Kaspi Bank' },
  { id: 'halyk', name: 'Halyk Bank' },
  { id: 'bcc', name: 'BCC Bank' }
];

const fetchUserAccounts = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string
): Promise<ConnectedAccount[]> => {
  if (!supabase) return [];

  const { data: rows, error: fetchError } = await supabase
    .from('new_scheta')
    .select('id, nazvanie_banka, balans')
    .eq('vladilec_id', userId)
    .order('nazvanie_banka', { ascending: true });

  if (fetchError) throw fetchError;

  return (rows ?? []).map((row) => ({
    id: String((row as { id?: string }).id ?? ''),
    bank:
      normalizeToStandardBankName((row as { nazvanie_banka?: string | null }).nazvanie_banka) ??
      String((row as { nazvanie_banka?: string | null }).nazvanie_banka ?? 'Bank'),
    balance: Number((row as { balans?: number | null }).balans ?? 0)
  }));
};

const fetchRecipientAccounts = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string
): Promise<RecipientAccount[]> => {
  if (!supabase) return [];

  const { data: rows, error: fetchError } = await supabase
    .from('new_scheta')
    .select('id, nazvanie_banka')
    .eq('vladilec_id', userId);

  if (fetchError) throw fetchError;

  return (rows ?? []).map((row) => ({
    id: String((row as { id?: string }).id ?? ''),
    bank:
      normalizeToStandardBankName((row as { nazvanie_banka?: string | null }).nazvanie_banka) ??
      String((row as { nazvanie_banka?: string | null }).nazvanie_banka ?? '')
  }));
};

const logRecipientAccountsDiagnostics = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string
) => {
  if (!supabase) return;
  // eslint-disable-next-line no-console
  console.log('Найден пользователь ID:', userId);
  const { data: accounts, error } = await supabase
    .from('new_scheta')
    .select('*')
    .eq('vladilec_id', userId);

  if (error) {
    // eslint-disable-next-line no-console
    console.log('Найденные счета получателя: ошибка чтения', error);
    return;
  }

  // eslint-disable-next-line no-console
  console.log('Найденные счета получателя:', accounts);
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
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [ownPhoneDigits, setOwnPhoneDigits] = useState('');
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccount[]>([]);
  const [recipientLookupError, setRecipientLookupError] = useState<string | null>(null);
  const [isRecipientLookupLoading, setIsRecipientLookupLoading] = useState(false);

  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [recipientBankId, setRecipientBankId] = useState<BankId>('halyk');

  const [phoneDigits, setPhoneDigits] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [lastTransferDraft, setLastTransferDraft] = useState<NewFavoriteContactInput | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  const [newFavoriteName, setNewFavoriteName] = useState('');
  const [newFavoriteCategory, setNewFavoriteCategory] = useState<FavoriteCategory>('phone');
  const [newFavoriteBankName, setNewFavoriteBankName] = useState<StandardBankName>('Kaspi Bank');
  const [newFavoriteValue, setNewFavoriteValue] = useState('');
  const [newFavoriteAvatar, setNewFavoriteAvatar] = useState('');
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const amountValue = Number(amount || 0);

  const keepPhoneCaretAfterPrefix = () => {
    requestAnimationFrame(() => {
      const input = phoneInputRef.current;
      if (!input) return;

      const minPrefixCaret = 3; // "+7 "
      if ((input.selectionStart ?? 0) < minPrefixCaret) {
        input.setSelectionRange(minPrefixCaret, minPrefixCaret);
      }
    });
  };

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
        const currentProfileId = await resolveRequiredProfileIdByAuthUserId(supabase, user.id);
        setProfileUserId(currentProfileId);

        const normalized = await fetchUserAccounts(supabase, currentProfileId);
        if (normalized.length === 0) {
          await ensureStandardAccountsForUser(user.id);
        }
        const normalizedAfterInit =
          normalized.length > 0 ? normalized : await fetchUserAccounts(supabase, currentProfileId);
        if (!isMounted) return;

        setAccounts(normalizedAfterInit);
        setFromAccountId((prev) => prev || normalizedAfterInit[0]?.id || '');
        setToAccountId(
          (prev) => prev || normalizedAfterInit[1]?.id || normalizedAfterInit[0]?.id || ''
        );

        const { data: ownProfile } = await supabase
          .from('new_polzovateli')
          .select('nomer_telefona')
          .eq('id', currentProfileId)
          .maybeSingle();
        setOwnPhoneDigits(
          extractKzPhoneDigits((ownProfile as { nomer_telefona?: string } | null)?.nomer_telefona)
        );
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
      const selectedBank =
        normalizeToStandardBankName(mapRecipientBankToDbName(recipientBankId)) ?? 'Kaspi Bank';

      const digits = phoneDigits;
      if (digits.length !== 10) {
        if (!isMounted) return;
        setRecipientName(null);
        setRecipientUserId(null);
        setRecipientAccounts([]);
        setRecipientLookupError(null);
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        setIsRecipientLookupLoading(true);

        const applyRecipientDiagnostics = async (profile: ProfileLookupRow) => {
          const fullName = `${profile.imya ?? ''} ${profile.familiya ?? ''}`.trim();
          setRecipientName(fullName || 'Получатель FinHub');
          setRecipientUserId(profile.id);
          setRecipientLookupError(null);

          await logRecipientAccountsDiagnostics(supabase, profile.id);

          const matchedAccounts = await fetchRecipientAccounts(supabase, profile.id);
          if (!isMounted) return;
          setRecipientAccounts(matchedAccounts);

          if (matchedAccounts.length === 0) {
            setRecipientLookupError('У пользователя не открыто ни одного банковского счета');
            return;
          }

          const { data: selectedBankAccounts, error: selectedBankAccountsError } = await supabase
            .from('new_scheta')
            .select('id')
            .eq('vladilec_id', profile.id)
            .eq('nazvanie_banka', selectedBank)
            .limit(1);

          if (selectedBankAccountsError) throw selectedBankAccountsError;

          if (!selectedBankAccounts || selectedBankAccounts.length === 0) {
            const availableBanks = matchedAccounts.map((row) => row.bank).join(', ');
            setRecipientLookupError(
              `У получателя есть счета в ${availableBanks}, но нет счета в ${selectedBank}`
            );
            return;
          }

          setRecipientLookupError(null);
        };

        const searchPhoneE164 = toKzE164Phone(digits);
        const { data: exactProfile, error: exactProfileError } = await supabase
          .from('new_polzovateli')
          .select('id, imya, familiya, nomer_telefona')
          .eq('nomer_telefona', searchPhoneE164)
          .maybeSingle();

        if (exactProfileError) throw exactProfileError;
        if (!isMounted) return;

        if (exactProfile) {
          await applyRecipientDiagnostics(exactProfile as ProfileLookupRow);
          return;
        }

        const { data, error } = await supabase
          .from('new_polzovateli')
          .select('id, imya, familiya, nomer_telefona')
          .not('nomer_telefona', 'is', null);

        if (error) throw error;
        if (!isMounted) return;

        const matched = (data as ProfileLookupRow[] | null)?.find(
          (profile) => extractKzPhoneDigits(profile.nomer_telefona) === digits
        );

        if (!matched) {
          setRecipientName(null);
          setRecipientUserId(null);
          setRecipientAccounts([]);
          setRecipientLookupError('Пользователь с таким номером еще не зарегистрирован в FinHub');
          return;
        }

        await applyRecipientDiagnostics(matched);
      } catch (lookupError) {
        // eslint-disable-next-line no-console
        console.error('Recipient lookup failed:', lookupError);
        if (!isMounted) return;
        setRecipientLookupError('Ошибка поиска получателя. Попробуйте снова.');
      } finally {
        if (isMounted) setIsRecipientLookupLoading(false);
      }
    };

    lookupRecipientByPhone();

    return () => {
      isMounted = false;
    };
  }, [method, phoneDigits, recipientBankId]);

  useEffect(() => {
    if (method !== 'phone') {
      setRecipientName(null);
      setRecipientUserId(null);
      setRecipientAccounts([]);
      setRecipientLookupError(null);
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

  const sourceAccount = accounts.find((account) => account.id === fromAccountId) ?? null;
  const destinationAccount = accounts.find((account) => account.id === toAccountId) ?? null;

  const sourceBankId = normalizeBankId(sourceAccount?.bank);
  const selectedRecipientBankName = mapRecipientBankToDbName(recipientBankId);
  const recipientAccountForPhone =
    recipientAccounts.find((account) => normalizeBankId(account.bank) === recipientBankId) ?? null;
  const recipientPhoneBankId = normalizeBankId(recipientAccountForPhone?.bank);
  const hasRecipientBankAccount = (bankName: StandardBankName) =>
    recipientAccounts.some((account) => account.bank === bankName);

  const applyFavoriteTransfer = (favorite: FavoriteContact) => {
    setError(null);
    setRecipientName(null);
    setRecipientUserId(null);
    setRecipientAccounts([]);
    setRecipientLookupError(null);

    const targetBankId = normalizeBankId(favorite.bank_name);
    setRecipientBankId(targetBankId === 'unknown' ? 'halyk' : targetBankId);

    if (favorite.category === 'card') {
      setMethod('card');
      setCardNumber(formatCardValue(favorite.phone_number));
    } else if (favorite.category === 'own') {
      setMethod('own');
    } else {
      setMethod('phone');
      setPhoneDigits(extractKzPhoneDigits(favorite.phone_number));
      setRecipientName(favorite.name);
    }

    setComment(`Перевод: ${favorite.name}`);
    setAmount('');
    setScreen('form');
  };

  const handleCreateFavorite = async () => {
    const phoneDigitsForFavorite = extractKzPhoneDigits(newFavoriteValue);
    const normalizedValue =
      newFavoriteCategory === 'card'
        ? newFavoriteValue.replace(/\D/g, '').slice(0, 16)
        : toKzE164Phone(phoneDigitsForFavorite);

    if (!newFavoriteName.trim()) {
      setError('Введите имя контакта.');
      return;
    }

    if (newFavoriteCategory === 'card' && normalizedValue.length !== 16) {
      setError('Введите корректный номер карты из 16 цифр.');
      return;
    }

    if (newFavoriteCategory === 'phone' && phoneDigitsForFavorite.length !== 10) {
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
      if (sourceBankId === recipientPhoneBankId) return 0;
      return Math.round(amountValue * 0.005);
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
  }, [amountValue, method, sourceBankId, recipientBankId, recipientPhoneBankId]);

  const totalDebit = Math.max(0, amountValue + commission);
  const insufficientFunds = Boolean(sourceAccount && totalDebit > sourceAccount.balance);

  const openMethodForm = (nextMethod: TransferMethod) => {
    setMethod(nextMethod);
    setError(null);
    setScreen('form');
  };

  const commissionText = `Комиссия: ${formatCurrency(commission).replace('KZT', '₸')}`;

  const createTransactionRecord = async (params: {
    userId: string;
    amount: number;
    description: string;
    counterparty: string;
    category: string;
    commission: number;
    bankName: string;
    kind: 'income' | 'expense';
  }) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabase.from('new_tranzakcii').insert({
      user_id: params.userId,
      amount: params.amount,
      description: params.description,
      category: params.category,
      counterparty: params.counterparty,
      commission: params.commission,
      bank: params.bankName,
      type: params.kind,
      date: nowIso
    });

    if (insertError) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert transaction record:', insertError);
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

    if (method === 'phone' && phoneDigits.length !== 10) {
      setError('Введите номер в формате +7 (7xx) xxx-xx-xx.');
      return;
    }

    if (method === 'phone') {
      const enteredPhoneDigits = phoneDigits;
      if (
        (ownPhoneDigits && enteredPhoneDigits === ownPhoneDigits) ||
        (recipientUserId && profileUserId && recipientUserId === profileUserId)
      ) {
        setError('Нельзя перевести деньги самому себе по номеру телефона.');
        return;
      }

      if (!recipientUserId || !recipientName) {
        setError('Пользователь с таким номером не зарегистрирован в FinHub');
        return;
      }

      if (!recipientAccountForPhone) {
        setError('У получателя нет счета в этом банке');
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
      if (!profileUserId) {
        throw new Error('Не удалось определить пользователя для операции.');
      }

      const sourceNewBalance = sourceAccount.balance - totalDebit;

      if (method === 'own' && destinationAccount) {
        const { error: updateSourceError } = await supabase
          .from('new_scheta')
          .update({ balans: sourceNewBalance })
          .eq('id', sourceAccount.id);

        if (updateSourceError) throw updateSourceError;

        const destinationNewBalance = destinationAccount.balance + amountValue;

        const { error: updateDestinationError } = await supabase
          .from('new_scheta')
          .update({ balans: destinationNewBalance })
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
          userId: profileUserId,
          amount: -totalDebit,
          description: `Перевод на свой счет ${destinationAccount.bank}`,
          counterparty: destinationAccount.bank,
          category: 'Переводы',
          commission,
          bankName: sourceAccount.bank,
          kind: 'expense'
        });
        await createTransactionRecord({
          userId: profileUserId,
          amount: amountValue,
          description: `Перевод со своего счета ${sourceAccount.bank}`,
          counterparty: sourceAccount.bank,
          category: 'Переводы',
          commission: 0,
          bankName: destinationAccount.bank,
          kind: 'income'
        });
      } else if (method === 'phone') {
        // eslint-disable-next-line no-console
        console.log('Transfer recipient user_id:', recipientUserId);

        const { data: recipientAccountStrict, error: recipientAccountStrictError } = await supabase
          .from('new_scheta')
          .select('id')
          .eq('id', recipientAccountForPhone?.id ?? '')
          .eq('vladilec_id', recipientUserId)
          .eq('nazvanie_banka', selectedRecipientBankName)
          .maybeSingle();

        if (recipientAccountStrictError || !recipientAccountStrict) {
          setError('У получателя нет счета в этом банке');
          return;
        }

        const ownerIdFromRecipientAccount = extractProfileIdFromAccountId(recipientAccountForPhone?.id);
        const recipientOwnerProfile = recipientAccountForPhone?.id
          ? await findProfileByAccountId(supabase, recipientAccountForPhone.id)
          : null;
        if (
          (ownerIdFromRecipientAccount && ownerIdFromRecipientAccount !== recipientUserId) ||
          (recipientOwnerProfile?.id && recipientOwnerProfile.id !== recipientUserId)
        ) {
          setError('Ошибка сопоставления счета получателя. Попробуйте выбрать банк заново.');
          return;
        }

        const { error: transferRpcError } = await supabase.rpc('execute_phone_transfer', {
          p_sender_user_id: profileUserId,
          p_sender_account_id: sourceAccount.id,
          p_recipient_user_id: recipientUserId,
          p_recipient_account_id: recipientAccountForPhone?.id,
          p_amount: amountValue,
          p_commission: commission,
          p_sender_counterparty: recipientName ?? 'Перевод по номеру телефона',
          p_recipient_counterparty: sourceAccount.bank
        });

        if (transferRpcError) throw transferRpcError;

        setAccounts((prev) =>
          prev.map((account) =>
            account.id === sourceAccount.id ? { ...account, balance: sourceNewBalance } : account
          )
        );
      } else {
        const { error: updateSourceError } = await supabase
          .from('new_scheta')
          .update({ balans: sourceNewBalance })
          .eq('id', sourceAccount.id);

        if (updateSourceError) throw updateSourceError;

        setAccounts((prev) =>
          prev.map((account) =>
            account.id === sourceAccount.id ? { ...account, balance: sourceNewBalance } : account
          )
        );

        const transferCounterparty =
          method === 'phone'
            ? recipientName ?? `Телефон ${phoneDigits.slice(-4)}`
            : `Карта ${cardNumber.replace(/\D/g, '').slice(-4)}`;
        const transferDescription =
          method === 'phone'
            ? `Перевод ${recipientName ?? `на номер ${formatKzPhoneFromDigits(phoneDigits)}`}`
            : `Перевод на карту ${cardNumber.replace(/\D/g, '').slice(-4)}`;

        await createTransactionRecord({
          userId: profileUserId,
          amount: -totalDebit,
          description: transferDescription,
          counterparty: transferCounterparty,
          category: 'Переводы',
          commission,
          bankName: sourceAccount.bank,
          kind: 'expense'
        });
      }

      window.dispatchEvent(new Event('finhub:accounts-updated'));
      window.dispatchEvent(new Event('finhub:transactions-updated'));

      setSuccessMessage(
        `Перевод успешно выполнен. Списано ${formatCurrency(totalDebit).replace('KZT', '₸')}.`
      );
      setScreen('success');
      if (method === 'phone' || method === 'card') {
        const draftValue =
          method === 'phone'
            ? toKzE164Phone(phoneDigits)
            : cardNumber.replace(/\D/g, '').slice(0, 16);

        if (draftValue) {
          setLastTransferDraft({
            name:
              method === 'phone'
                ? recipientName ?? `Контакт ${phoneDigits.slice(-4)}`
                : `Карта ${draftValue.slice(-4)}`,
            phone_number: draftValue,
            bank_name: selectedRecipientBankName,
            avatar_url: null,
            category: method
          });
        }
      } else {
        setLastTransferDraft(null);
      }

      setAmount('');
      setComment('');
      setPhoneDigits('');
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
    method === 'own'
      ? getBankMeta(destinationAccount?.bank)
      : method === 'phone'
        ? getBankMeta(recipientAccountForPhone?.bank ?? selectedRecipientBankName)
        : getBankMeta(selectedRecipientBankName);
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
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${fromAccountId === account.id
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
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${toAccountId === account.id
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
                    <div className="relative">
                      <input
                        ref={phoneInputRef}
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        value={formatKzPhoneFromDigits(phoneDigits)}
                        onChange={(e) => setPhoneDigits(extractKzPhoneDigits(e.target.value))}
                        onFocus={keepPhoneCaretAfterPrefix}
                        onClick={keepPhoneCaretAfterPrefix}
                        placeholder="+7 (7xx) xxx-xx-xx"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 pr-10 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                      />
                      {isRecipientLookupLoading && phoneDigits.length === 10 && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-300">
                          <Loader2 size={16} className="animate-spin" />
                        </span>
                      )}
                    </div>
                    {isRecipientLookupLoading && phoneDigits.length === 10 && (
                      <p className="text-xs text-slate-400">Поиск получателя...</p>
                    )}
                    {!isRecipientLookupLoading && recipientName && (
                      <p className="text-xs text-emerald-300">Получатель: {recipientName}</p>
                    )}
                    {!isRecipientLookupLoading && recipientName && recipientAccounts.length > 0 && (
                      <p className="text-xs text-slate-400">
                        Доступные счета: {recipientAccounts.map((acc) => acc.bank).join(', ')}
                      </p>
                    )}
                    {!isRecipientLookupLoading && phoneDigits.length === 10 && !recipientName && (
                      <p className="text-xs text-rose-300">
                        {recipientLookupError ??
                          'Пользователь с таким номером еще не зарегистрирован в FinHub'}
                      </p>
                    )}
                    {!isRecipientLookupLoading && recipientName && !recipientAccountForPhone && (
                      <p className="text-xs text-rose-300">
                        {recipientLookupError ?? 'У получателя нет счета в этом банке'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Банк получателя</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {STANDARD_TRANSFER_BANK_OPTIONS.map((bank) => {
                        const bankMeta = getBankMeta(bank.name);
                        const isBankAvailable =
                          recipientAccounts.length === 0 ? false : hasRecipientBankAccount(bank.name);
                        const disableBankOption =
                          Boolean(recipientName) &&
                          !isBankAvailable;
                        const optionTone = disableBankOption
                          ? 'border-slate-700 bg-slate-900/70 text-slate-500'
                          : recipientBankId === bank.id
                            ? 'border-emerald-400/80 bg-emerald-500/15 text-emerald-200'
                            : 'border-emerald-700/60 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/80';
                        return (
                          <button
                            key={bank.id}
                            type="button"
                            onClick={() => {
                              if (disableBankOption) return;
                              setRecipientBankId(bank.id);
                            }}
                            disabled={disableBankOption}
                            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${optionTone} ${disableBankOption ? 'cursor-not-allowed opacity-60' : ''
                              }`}
                          >
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bankMeta.badgeTone}`}>
                              {bankMeta.logo}
                            </span>
                            <span>{bank.name}</span>
                          </button>
                        );
                      })}
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
                      {STANDARD_TRANSFER_BANK_OPTIONS.map((bank) => {
                        const bankMeta = getBankMeta(bank.name);
                        return (
                          <button
                            key={bank.id}
                            type="button"
                            onClick={() => setRecipientBankId(bank.id)}
                            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${recipientBankId === bank.id
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
                              }`}
                          >
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bankMeta.badgeTone}`}>
                              {bankMeta.logo}
                            </span>
                            <span>{bank.name}</span>
                          </button>
                        );
                      })}
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
                  (method === 'phone' && !recipientUserId) ||
                  (method === 'phone' && !recipientAccountForPhone) ||
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
                      className={`rounded-xl px-3 py-2 text-xs transition ${newFavoriteCategory === 'phone'
                        ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-200'
                        : 'border border-slate-700 bg-slate-900/70 text-slate-300'
                        }`}
                    >
                      По телефону
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFavoriteCategory('card')}
                      className={`rounded-xl px-3 py-2 text-xs transition ${newFavoriteCategory === 'card'
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
                          : formatKzPhoneFromDigits(extractKzPhoneDigits(e.target.value))
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
                    onChange={(e) => setNewFavoriteBankName(e.target.value as StandardBankName)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  >
                    {STANDARD_BANK_NAMES.map((bankName) => (
                      <option key={bankName} value={bankName}>
                        {bankName}
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
