import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { useUser } from '../context/UserContext';
import { getSupabaseClient } from '../lib/supabaseClient';

const emailRegex = /\S+@\S+\.\S+/;
const monthOptions = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
];

type RegisterStep = 1 | 2 | 3;

const normalizeBirthDate = (day: string, month: string, year: string): string | null => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) {
    return null;
  }

  if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }

  const candidate = new Date(y, m - 1, d);
  const isExactDate =
    candidate.getFullYear() === y && candidate.getMonth() === m - 1 && candidate.getDate() === d;
  const isFutureDate = candidate > new Date();

  if (!isExactDate || isFutureDate) {
    return null;
  }

  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d
    .toString()
    .padStart(2, '0')}`;
};

const normalizePhoneDigits = (input: string) => {
  let digits = input.replace(/\D/g, '');
  const hasPlusSevenPrefix = input.trim().startsWith('+7');

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  // Remove country code only when it is clearly present.
  if ((hasPlusSevenPrefix && digits.startsWith('7')) || digits.length === 11) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
};

const formatPhoneValue = (digitsInput: string) => {
  const digits = digitsInput.slice(0, 10);

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

const formatSupabaseError = (
  title: string,
  error: { message: string; details?: string; hint?: string; code?: string }
) =>
  `${title}: ${error.message}${error.details ? ` | details: ${error.details}` : ''}${
    error.hint ? ` | hint: ${error.hint}` : ''
  }${error.code ? ` | code: ${error.code}` : ''}`;

const RegisterPage = () => {
  const { login } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState<RegisterStep>(1);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');

  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedPersonalData, setAgreedPersonalData] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const birthDate = useMemo(
    () => normalizeBirthDate(birthDay, birthMonth, birthYear),
    [birthDay, birthMonth, birthYear]
  );

  const isStep1Valid = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const isStep2Valid = Boolean(birthDate);
  const isStep3FieldsValid =
    emailRegex.test(email) &&
    phoneDigits.length === 10 &&
    password.length >= 6 &&
    password === confirmPassword &&
    agreedPersonalData &&
    agreedTerms;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;

    setError(null);
    setIsSubmitting(true);

    try {
      if (!isStep1Valid || !isStep2Valid || !isStep3FieldsValid || !birthDate) {
        setError('Заполните корректно все поля и подтвердите оба соглашения.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Пароли не совпадают.');
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        setError('Supabase не настроен. Проверьте переменные окружения.');
        return;
      }

      // Регистрация через Supabase Auth с метаданными для FinHub
      const normalizedPhone = `+7${phoneDigits}`;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            appName: 'FinHub',
            senderName: 'FinHub Support',
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            birth_date: birthDate,
            phone_number: normalizedPhone
          }
        }
      });

      if (signUpError) {
        // eslint-disable-next-line no-console
        console.error(signUpError);
        setError(
          formatSupabaseError('Ошибка регистрации', {
            message: signUpError.message,
            details: signUpError.details ?? undefined,
            hint: signUpError.hint ?? undefined,
            code: signUpError.code ?? undefined
          })
        );
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        setError('Auth вернул пустой user.id. Профиль не может быть создан.');
        return;
      }

      // Прямая запись профиля сразу после signUp
      const baseProfilePayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: normalizedPhone,
        birth_date: birthDate
      };

      const { error: profileUpsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            ...baseProfilePayload
          },
          { onConflict: 'id' }
        );

      if (profileUpsertError) {
        // eslint-disable-next-line no-console
        console.error('Supabase profiles upsert error:', profileUpsertError);
        setError(
          formatSupabaseError('Ошибка записи профиля', {
            message: profileUpsertError.message,
            details: profileUpsertError.details ?? undefined,
            hint: profileUpsertError.hint ?? undefined,
            code: profileUpsertError.code ?? undefined
          })
        );
        return;
      }

      const starterBanks = ['Kaspi Gold', 'Halyk Bank'] as const;
      const { data: existingStarterAccounts, error: existingAccountsError } = await supabase
        .from('accounts')
        .select('bank')
        .eq('user_id', userId)
        .in('bank', [...starterBanks]);

      if (existingAccountsError) {
        // eslint-disable-next-line no-console
        console.error('Supabase accounts pre-check error:', existingAccountsError);
        setError(
          formatSupabaseError('Ошибка проверки стартовых счетов', {
            message: existingAccountsError.message,
            details: existingAccountsError.details ?? undefined,
            hint: existingAccountsError.hint ?? undefined,
            code: existingAccountsError.code ?? undefined
          })
        );
        return;
      }

      const existingBanks = new Set(
        (existingStarterAccounts ?? []).map((row) => String((row as { bank?: string }).bank ?? ''))
      );
      const starterRows = starterBanks
        .filter((bank) => !existingBanks.has(bank))
        .map((bank) => ({
          user_id: userId,
          bank,
          balance: 0
        }));

      if (starterRows.length > 0) {
        const { error: starterAccountsError } = await supabase.from('accounts').insert(starterRows);
        if (starterAccountsError) {
          // eslint-disable-next-line no-console
          console.error('Supabase starter accounts insert error:', starterAccountsError);
          setError(
            formatSupabaseError('Ошибка создания стартовых счетов', {
              message: starterAccountsError.message,
              details: starterAccountsError.details ?? undefined,
              hint: starterAccountsError.hint ?? undefined,
              code: starterAccountsError.code ?? undefined
            })
          );
          return;
        }
      }

      // Автоматический вход после успешного signUp + insert профиля
      let hasSession = Boolean(signUpData.session);
      if (!hasSession) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          // eslint-disable-next-line no-console
          console.error(signInError);
          setError(
            formatSupabaseError('Профиль создан, но вход не выполнен', {
              message: signInError.message,
              details: signInError.details ?? undefined,
              hint: signInError.hint ?? undefined,
              code: signInError.code ?? undefined
            })
          );
          return;
        }
        hasSession = true;
      }

      if (!hasSession) {
        setError('Профиль создан, но сессия не активна. Выполните вход вручную.');
        return;
      }

      login(email, true);
      navigate('/dashboard');
    } catch (unexpectedError) {
      // eslint-disable-next-line no-console
      console.error('Unexpected register flow error:', unexpectedError);
      setError('Не удалось создать аккаунт. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNextStep = () => {
    setError(null);
    if (step === 1 && !isStep1Valid) {
      setError('Введите имя и фамилию (минимум 2 символа).');
      return;
    }
    if (step === 2 && !isStep2Valid) {
      setError('Укажите корректную дату рождения.');
      return;
    }
    setStep((prev) => (prev < 3 ? ((prev + 1) as RegisterStep) : prev));
  };

  const goPrevStep = () => {
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as RegisterStep) : prev));
  };

  return (
    <AuthLayout
      title="Регистрация в FinHub"
      subtitle="Создайте безопасный профиль FinHub для управления счетами и транзакциями."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`rounded-full px-2 py-1 text-center text-[11px] font-medium transition ${
                step === s
                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/60'
                  : step > s
                    ? 'bg-slate-700/70 text-slate-200'
                    : 'bg-slate-800/70 text-slate-400'
              }`}
            >
              Шаг {s}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.section
              key="step-1"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="firstName">
                  Имя
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Айдана"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="lastName">
                  Фамилия
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Сапарова"
                />
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section
              key="step-2"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">Дата рождения</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    placeholder="День"
                  />
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                  >
                    <option value="">Месяц</option>
                    {monthOptions.map((name, idx) => (
                      <option key={name} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1900}
                    max={new Date().getFullYear()}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="Год"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Дата нужна для подтверждения профиля и персонализации финансовых рекомендаций FinHub.
                </p>
              </div>
            </motion.section>
          )}

          {step === 3 && (
            <motion.section
              key="step-3"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="phoneNumber">
                  Номер телефона
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={formatPhoneValue(phoneDigits)}
                  onChange={(e) => setPhoneDigits(normalizePhoneDigits(e.target.value))}
                  placeholder="+7 (7xx) xxx-xx-xx"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="password">
                  Пароль
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300" htmlFor="passwordConfirm">
                  Подтверждение пароля
                </label>
                <input
                  id="passwordConfirm"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                />
              </div>

              <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
                <label className="flex items-start gap-2.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-400 focus:ring-emerald-500"
                    checked={agreedPersonalData}
                    onChange={(e) => setAgreedPersonalData(e.target.checked)}
                  />
                  <span>
                    Я даю согласие на обработку персональных данных и использование информации о
                    моих финансовых транзакциях и банковских счетах для анализа и персонализации
                    предложений в приложении FinHub.{' '}
                    <a
                      href="https://finhub.app/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
                    >
                      Политика конфиденциальности
                    </a>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-400 focus:ring-emerald-500"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                  />
                  <span>
                    Я подтверждаю, что ознакомлен с условиями Пользовательского соглашения FinHub и
                    Условиями безопасного подключения банковских API.{' '}
                    <a
                      href="https://finhub.app/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
                    >
                      Пользовательское соглашение
                    </a>
                  </span>
                </label>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {step > 1 && (
            <button
              type="button"
              onClick={goPrevStep}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800"
            >
              Назад
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={goNextStep}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50"
            >
              Далее
            </button>
          ) : (
            <button
              type="submit"
              disabled={!isStep1Valid || !isStep2Valid || !isStep3FieldsValid || isSubmitting}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50 disabled:cursor-not-allowed disabled:bg-emerald-700/50 disabled:text-emerald-100 disabled:shadow-none"
            >
              {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          )}
        </div>

        <p className="pt-2 text-center text-[11px] text-slate-400">
          Уже есть аккаунт?{' '}
          <Link
            to="/login"
            className="font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
          >
            Войти
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default RegisterPage;
