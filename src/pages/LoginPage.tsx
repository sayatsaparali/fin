import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { useUser } from '../context/UserContext';
import { getSupabaseClient } from '../lib/supabaseClient';

const emailRegex = /\S+@\S+\.\S+/;

const LoginPage = () => {
  const { login } = useUser();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailRegex.test(email)) {
      setError('Пожалуйста, введите корректный email.');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов.');
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setError('Supabase не настроен. Проверьте переменные окружения.');
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !data.user) {
      setError('Неверный email или пароль.');
      // eslint-disable-next-line no-console
      if (signInError) console.error(signInError);
      return;
    }

    const emailVerified = Boolean(data.user.email_confirmed_at);

    // Обновляем контекст пользователя
    login(email, emailVerified);

    // Если email не подтверждён — отправляем на страницу ожидания
    if (!emailVerified) {
      navigate('/email-verification');
      return;
    }

    navigate('/dashboard');
  };

  return (
    <AuthLayout title="Вход в FinHub" subtitle="Агрегируйте счета Kaspi, Freedom и Halyk в одном месте.">
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
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50"
        >
          Войти в Dashboard
        </button>

        <p className="pt-2 text-center text-[11px] text-slate-400">
          Нет аккаунта?{' '}
          <Link
            to="/register"
            className="font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
