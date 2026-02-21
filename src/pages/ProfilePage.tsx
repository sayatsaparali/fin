import { useEffect, useState } from 'react';
import { Phone, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { extractKzPhoneDigits, formatKzPhoneFromDigits } from '../lib/phone';
import { resolveRequiredProfileIdByAuthUserId } from '../lib/profileIdentity';
import { getSupabaseClient } from '../lib/supabaseClient';
import { STANDARD_BANK_NAMES } from '../lib/standardBanks';

type ProfileData = {
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  birth_date: string | null;
};

const TEST_BALANCE_AMOUNT = 50000;

const getEmailAlias = (email: string | null | undefined) => {
  if (!email) return 'Пользователь FinHub';
  return email.split('@')[0] || 'Пользователь FinHub';
};

const formatBirthDate = (date: string | null) => {
  if (!date) return 'Не указана';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(parsed);
};

const formatPhoneNumber = (value: string | null) => {
  if (!value) return 'Не указан';
  const digits = extractKzPhoneDigits(value);
  if (digits.length !== 10) return value;
  return formatKzPhoneFromDigits(digits);
};

const ProfilePage = () => {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError('Supabase не настроен.');
          return;
        }

        const {
          data: { user: authUser },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !authUser) {
          throw userError ?? new Error('Пользователь не найден.');
        }

        const profileId = await resolveRequiredProfileIdByAuthUserId(supabase, authUser.id);

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone_number, birth_date')
          .eq('id', profileId)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (!isMounted) return;
        setProfile(data ?? null);
      } catch (e) {
        if (!isMounted) return;
        setError('Не удалось загрузить данные профиля.');
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.email]);

  const handleGrantTestBalance = async () => {
    setIsGranting(true);
    setError(null);
    setGrantSuccess(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase не настроен.');

      const {
        data: { user: authUser },
        error: userError
      } = await supabase.auth.getUser();
      if (userError || !authUser) throw userError ?? new Error('Пользователь не найден.');

      const profileId = await resolveRequiredProfileIdByAuthUserId(supabase, authUser.id);

      // Обновляем баланс всех стандартных счетов до TEST_BALANCE_AMOUNT
      for (const bankName of STANDARD_BANK_NAMES) {
        // Попытка 1: bank_name
        // eslint-disable-next-line no-await-in-loop
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ balance: TEST_BALANCE_AMOUNT })
          .eq('user_id', profileId)
          .eq('bank_name', bankName);

        if (updateError) {
          // Попытка 2: bank (fallback column name)
          // eslint-disable-next-line no-await-in-loop
          const { error: fallbackError } = await supabase
            .from('accounts')
            .update({ balance: TEST_BALANCE_AMOUNT })
            .eq('user_id', profileId)
            .eq('bank', bankName);

          if (fallbackError) {
            throw fallbackError;
          }
        }
      }

      setGrantSuccess(
        `Начислено ${TEST_BALANCE_AMOUNT.toLocaleString('ru-KZ')} ₸ на каждый из ${STANDARD_BANK_NAMES.length} счетов.`
      );
      window.dispatchEvent(new Event('finhub:accounts-updated'));
    } catch (e) {
      setError('Не удалось начислить тестовый баланс.');
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setIsGranting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase не настроен.');
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }

      logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setError('Не удалось выйти из аккаунта. Попробуйте ещё раз.');
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setIsSigningOut(false);
    }
  };

  const firstName = String(profile?.first_name ?? '').trim();
  const lastName = String(profile?.last_name ?? '').trim();
  const fullName = `${firstName} ${lastName}`.trim() || firstName || getEmailAlias(user?.email);
  const safeFirstName = firstName || 'Не указано';
  const safeLastName = lastName || 'Не указано';
  const safePhone = formatPhoneNumber(profile?.phone_number ?? null);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">FinHub</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-100">Профиль</h1>
        <p className="mt-1 text-sm text-slate-400">{user?.email ?? 'Email не найден'}</p>
      </section>

      {error && (
        <section className="glass-soft border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </section>
      )}

      {grantSuccess && (
        <section className="glass-soft border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          {grantSuccess}
        </section>
      )}

      <section className="glass-panel p-5 sm:p-6">
        <div className="mb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Контактная информация</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Имя</p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {loading ? 'Загрузка...' : safeFirstName}
            </p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Фамилия</p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {loading ? 'Загрузка...' : safeLastName}
            </p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300">
              <Phone size={12} />
              Телефон
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">{loading ? 'Загрузка...' : safePhone}</p>
          </article>
        </div>
      </section>

      <section className="glass-panel grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Полное имя</p>
          <p className="mt-1 text-sm font-medium text-slate-100">
            {loading ? 'Загрузка...' : fullName}
          </p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Дата рождения</p>
          <p className="mt-1 text-sm font-medium text-slate-100">
            {loading ? 'Загрузка...' : formatBirthDate(profile?.birth_date ?? null)}
          </p>
        </article>
      </section>

      <section className="glass-soft border border-emerald-500/30 bg-emerald-500/10 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Настройки безопасности</p>
        <p className="mt-2 text-sm text-emerald-100">
          Данные и сессии защищены по стандарту FinHub: шифрование, контроль доступа и безопасная
          интеграция банковских API.
        </p>
      </section>

      <section className="glass-soft border border-amber-400/30 bg-amber-500/10 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Тестовый режим</p>
        <p className="mt-2 text-sm text-amber-100/80">
          Начислите тестовый баланс {TEST_BALANCE_AMOUNT.toLocaleString('ru-KZ')} ₸ на каждый банковский счёт для проверки переводов.
        </p>
        <button
          type="button"
          disabled={isGranting}
          onClick={handleGrantTestBalance}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500/90 px-4 py-2.5 text-xs font-semibold text-amber-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Wallet size={14} />
          {isGranting ? 'Начисление...' : `Начислить тестовые ${(TEST_BALANCE_AMOUNT / 1000).toFixed(0)}к`}
        </button>
      </section>

      <button
        type="button"
        disabled={isSigningOut}
        onClick={handleSignOut}
        className="inline-flex w-full items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSigningOut ? 'Выход...' : 'Выйти из аккаунта'}
      </button>
    </div>
  );
};

export default ProfilePage;
