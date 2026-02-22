import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { useUser } from '../context/UserContext';
import { ensureStandardAccountsForProfileId } from '../lib/accountsInitializer';
import { extractKzPhoneDigits, formatKzPhoneFromDigits, toKzE164Phone } from '../lib/phone';
import { generateUniqueDeterministicProfileId, resolveProfileByAuthUserId } from '../lib/profileIdentity';
import {
  getSupabaseClient,
  markSupabaseClientAsFailed,
  refreshSupabaseClient
} from '../lib/supabaseClient';

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

const formatSupabaseError = (
  title: string,
  error: { message: string; details?: string; hint?: string; code?: string }
) =>
  `${title}: ${error.message}${error.details ? ` | details: ${error.details}` : ''}${
    error.hint ? ` | hint: ${error.hint}` : ''
  }${error.code ? ` | code: ${error.code}` : ''}`;

const safeJsonStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ fallback: String(value) }, null, 2);
  }
};

const serializeUnknownError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
      ...(value as unknown as Record<string, unknown>)
    };
  }

  if (typeof value === 'object' && value !== null) {
    return value;
  }

  return { value: String(value) };
};

const isLoadFailedLikeError = (value: unknown) => {
  const serialized = serializeUnknownError(value) as Record<string, unknown>;
  const message = String(serialized.message ?? '').toLowerCase();
  const name = String(serialized.name ?? '').toLowerCase();
  return (
    message.includes('load failed') ||
    message.includes('failed to fetch') ||
    name.includes('typeerror')
  );
};

const buildDetailedUiError = (title: string, error: unknown, extra?: Record<string, unknown>) =>
  `${title}\n${safeJsonStringify({
    error: serializeUnknownError(error),
    ...(extra ?? {})
  })}`;

const runSupabaseNetworkProbe = async (supabaseUrl: string, anonKey: string) => {
  const endpoints = [`${supabaseUrl}/auth/v1/health`, `${supabaseUrl}/auth/v1/settings`, `${supabaseUrl}/rest/v1/`];
  const probeResults: Array<Record<string, unknown>> = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0'
        }
      });
      probeResults.push({
        endpoint,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });
    } catch (probeError) {
      probeResults.push({
        endpoint,
        ok: false,
        error: serializeUnknownError(probeError)
      });
    }
  }

  return probeResults;
};

const tryDirectSignUpFetch = async (params: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}) => {
  const response = await fetch(`${params.supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      apikey: params.anonKey,
      Authorization: `Bearer ${params.anonKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      data: params.metadata
    })
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    parsed = { rawText };
  }

  if (!response.ok) {
    return {
      data: null,
      error: {
        message:
          String(parsed?.msg ?? parsed?.error_description ?? parsed?.message ?? `HTTP ${response.status}`),
        code: String(response.status),
        details: rawText
      },
      raw: parsed
    };
  }

  return {
    data: {
      user: (parsed?.user as { id?: string } | null | undefined) ?? null,
      session: parsed?.session ?? null
    },
    error: null,
    raw: parsed
  };
};

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
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

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

      // --- Диагностика: проверяем что ключи на месте ---
      const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
      // eslint-disable-next-line no-console
      if (!env.VITE_SUPABASE_URL) console.error('URL MISSING');
      // eslint-disable-next-line no-console
      if (!env.VITE_SUPABASE_ANON_KEY) console.error('ANON KEY MISSING');
      // eslint-disable-next-line no-console
      console.log('Supabase URL:', env.VITE_SUPABASE_URL);

      // --- Регистрация через Supabase Auth ---
      // ВАЖНО: options.data сохраняется в auth.users.raw_user_meta_data.
      const normalizedPhone = toKzE164Phone(phoneDigits);
      const signUpMetadata = {
        // legacy keys used by some existing triggers/functions
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate,
        phone_number: normalizedPhone,
        // current app keys
        imya: firstName.trim(),
        familiya: lastName.trim(),
        nomer_telefona: normalizedPhone
      };

      let signUpData: { user?: { id?: string } | null; session?: unknown } | null = null;
      let signUpError: unknown = null;
      let signUpThrownError: unknown = null;
      try {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              ...signUpMetadata
            }
          }
        });
        signUpData = result.data;
        signUpError = result.error;
      } catch (networkError) {
        signUpThrownError = networkError;
      }

      // Если первый экземпляр клиента дал network/load fail, принудительно пересоздаем singleton и пробуем еще раз.
      if (signUpThrownError) {
        markSupabaseClientAsFailed();
        refreshSupabaseClient();
        const recreatedClient = getSupabaseClient();
        if (recreatedClient) {
          try {
            const retryResult = await recreatedClient.auth.signUp({
              email,
              password,
              options: {
                data: {
                  ...signUpMetadata
                }
              }
            });
            signUpData = retryResult.data;
            signUpError = retryResult.error;
            signUpThrownError = null;
          } catch (retryError) {
            signUpThrownError = retryError;
          }
        }
      }

      const shouldRunProbe =
        isLoadFailedLikeError(signUpThrownError) || isLoadFailedLikeError(signUpError);

      let networkProbe: Array<Record<string, unknown>> | null = null;
      if (shouldRunProbe && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
        networkProbe = await runSupabaseNetworkProbe(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
      }

      // Fallback: прямой fetch в Supabase Auth API, если именно Load failed / Failed to fetch
      if (
        shouldRunProbe &&
        env.VITE_SUPABASE_URL &&
        env.VITE_SUPABASE_ANON_KEY &&
        (!signUpData || signUpError || signUpThrownError)
      ) {
        try {
          const directSignUp = await tryDirectSignUpFetch({
            supabaseUrl: env.VITE_SUPABASE_URL,
            anonKey: env.VITE_SUPABASE_ANON_KEY,
            email,
            password,
            metadata: {
              ...signUpMetadata
            }
          });

          if (!directSignUp.error && directSignUp.data) {
            signUpData = directSignUp.data;
            signUpError = null;
            signUpThrownError = null;
          } else if (directSignUp.error) {
            signUpError = directSignUp.error;
          }
        } catch (directFetchError) {
          signUpThrownError = directFetchError;
        }
      }

      if (signUpThrownError) {
        // eslint-disable-next-line no-console
        console.error('FULL ERROR:', signUpThrownError);
        setError(
          buildDetailedUiError('Сетевая ошибка при регистрации (throw)', signUpThrownError, {
            env: {
              hasUrl: Boolean(env.VITE_SUPABASE_URL),
              hasAnonKey: Boolean(env.VITE_SUPABASE_ANON_KEY),
              urlPreview: env.VITE_SUPABASE_URL ?? '[EMPTY]'
            },
            networkProbe
          })
        );
        return;
      }

      if (signUpError) {
        // eslint-disable-next-line no-console
        console.error('FULL ERROR:', signUpError);
        // eslint-disable-next-line no-console
        console.dir(signUpError, { depth: null });
        const signUpErrorRecord = serializeUnknownError(signUpError) as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        };
        setError(
          buildDetailedUiError(
            formatSupabaseError('Ошибка регистрации', {
              message: String(signUpErrorRecord.message ?? 'Unknown error'),
              details: signUpErrorRecord.details,
              hint: signUpErrorRecord.hint,
              code: signUpErrorRecord.code
            }),
            signUpError,
            {
              env: {
                hasUrl: Boolean(env.VITE_SUPABASE_URL),
                hasAnonKey: Boolean(env.VITE_SUPABASE_ANON_KEY),
                urlPreview: env.VITE_SUPABASE_URL ?? '[EMPTY]'
              },
              networkProbe
            }
          )
        );
        return;
      }

      const authUserId = signUpData.user?.id;
      if (!authUserId) {
        setError('Auth вернул пустой user.id. Профиль не может быть создан.');
        return;
      }

      // --- Создание/обновление профиля в new_polzovateli (TEXT ID: YYMMDD-XXXXXX) ---
      const existingProfile = await resolveProfileByAuthUserId(supabase, authUserId);
      const profileId =
        existingProfile?.id ?? (await generateUniqueDeterministicProfileId(supabase, birthDate));
      const profilePayload = {
        id: profileId,
        auth_user_id: authUserId,
        imya: firstName.trim(),
        familiya: lastName.trim(),
        nomer_telefona: normalizedPhone
      };

      const primaryProfileWrite = await supabase
        .from('new_polzovateli')
        .upsert(profilePayload, { onConflict: 'auth_user_id' })
        .select('id')
        .single<{ id: string }>();

      const needsProfileFallback =
        primaryProfileWrite.error &&
        (String(primaryProfileWrite.error.code ?? '') === '42P10' ||
          String(primaryProfileWrite.error.code ?? '') === '23505');

      const fallbackProfileWrite = needsProfileFallback
        ? await supabase
            .from('new_polzovateli')
            .upsert(profilePayload, { onConflict: 'id' })
            .select('id')
            .single<{ id: string }>()
        : null;

      const finalProfileId = fallbackProfileWrite?.data?.id ?? primaryProfileWrite.data?.id ?? profileId;
      const profileWriteError = fallbackProfileWrite?.error ?? primaryProfileWrite.error;

      if (profileWriteError || !finalProfileId) {
        // eslint-disable-next-line no-console
        console.error('Ошибка создания профиля:', profileWriteError);
        setError(
          buildDetailedUiError(
            formatSupabaseError('Ошибка записи профиля', {
              message: String(profileWriteError?.message ?? 'unknown'),
              details: profileWriteError?.details ?? undefined,
              hint: profileWriteError?.hint ?? undefined,
              code: profileWriteError?.code ?? undefined
            }),
            profileWriteError ?? { message: 'No profile id returned' }
          )
        );
        return;
      }

      // --- Создание 3 банковских счетов в new_scheta (balans = 50 000 ₸) ---
      try {
        const { created } = await ensureStandardAccountsForProfileId(finalProfileId);
        // eslint-disable-next-line no-console
        console.log(`Создано ${created} банковских счетов для профиля ${finalProfileId}`);
      } catch (accountsError) {
        // eslint-disable-next-line no-console
        console.error('Ошибка создания счетов:', accountsError);
        setError(
          buildDetailedUiError(
            'Профиль создан, но не удалось создать банковские счета.',
            accountsError
          )
        );
        return;
      }

      // --- Проверка: все 3 счёта на месте ---
      const { data: verifyAccounts, error: verifyError } = await supabase
        .from('new_scheta')
        .select('nazvanie_banka')
        .eq('vladilec_id', finalProfileId);

      if (verifyError || !verifyAccounts || verifyAccounts.length < 3) {
        // eslint-disable-next-line no-console
        console.error('Верификация счетов не пройдена:', verifyError, verifyAccounts);
        setError(
          buildDetailedUiError(
            'Ошибка инициализации банковских счетов.',
            verifyError ?? { verifyAccountsCount: verifyAccounts?.length ?? 0 }
          )
        );
        return;
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
          console.dir(signInError, { depth: null });
          const errAny = signInError as unknown as Record<string, string | undefined>;
          setError(
            formatSupabaseError('Профиль создан, но вход не выполнен', {
              message: signInError.message,
              details: errAny.details,
              hint: errAny.hint,
              code: errAny.code
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
      setError(
        buildDetailedUiError('Не удалось создать аккаунт. Технический отчет:', unexpectedError)
      );
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
              className={`rounded-full px-2 py-1 text-center text-[11px] font-medium transition ${step === s
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
                  ref={phoneInputRef}
                  id="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                  value={formatKzPhoneFromDigits(phoneDigits)}
                  onChange={(e) => setPhoneDigits(extractKzPhoneDigits(e.target.value))}
                  onFocus={keepPhoneCaretAfterPrefix}
                  onClick={keepPhoneCaretAfterPrefix}
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

        {error && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200">
            {error}
          </pre>
        )}

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
