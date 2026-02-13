import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { useUser } from '../context/UserContext';
import { getSupabaseClient } from '../lib/supabaseClient';

const emailRegex = /\S+@\S+\.\S+/;

const RegisterPage = () => {
  const { login } = useUser();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!emailRegex.test(email)) {
      setError('Пожалуйста, введите корректный email.');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    const supabase = getSupabaseClient();

    if (supabase) {
      // Регистрация через Supabase Auth с метаданными для письма
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/email-verification`,
          data: {
            appName: 'FinHub',
            senderName: 'FinHub Support'
          }
        }
      });

      if (signUpError) {
        setError('Не удалось создать аккаунт. Попробуйте ещё раз.');
        // eslint-disable-next-line no-console
        console.error(signUpError);
        return;
      }
    }

    login(email);
    setInfo('Добро пожаловать в FinHub! На вашу почту отправлено письмо для подтверждения.');
    navigate('/email-verification');
  };

  return (
    <AuthLayout
      title="Регистрация в FinHub"
      subtitle="Создайте единый финансовый профиль перед подключением банков."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
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
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
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
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Повторите пароль"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {info && <p className="text-xs text-emerald-300">{info}</p>}

        <button
          type="submit"
          className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50"
        >
          Продолжить к верификации
        </button>

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

