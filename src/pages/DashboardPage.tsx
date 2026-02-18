import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { fetchDashboardData, type DashboardData } from '../lib/financeApi';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  }).format(value);

const DashboardPage = () => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [smartPocket, setSmartPocket] = useState(250000);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [fromBank, setFromBank] = useState<'Kaspi' | 'Freedom' | 'Halyk' | 'Unified' | 'External'>(
    'Kaspi'
  );
  const [toBank, setToBank] = useState<'Kaspi' | 'Freedom' | 'Halyk' | 'Unified' | 'External'>(
    'Unified'
  );

  const totalBalance = dashboardData?.totalBalance ?? 0;
  const availableBalance = useMemo(
    () => Math.max(totalBalance - smartPocket, 0),
    [totalBalance, smartPocket]
  );

  const commissionDescription = useMemo(() => {
    const isOpenBankingRoute =
      (fromBank === 'Kaspi' || fromBank === 'Freedom' || fromBank === 'Halyk') &&
      (toBank === 'Unified' || toBank === 'Kaspi' || toBank === 'Freedom' || toBank === 'Halyk');

    if (isOpenBankingRoute) {
      return 'Комиссия: 0 ₸ (Open Banking Tariff)';
    }

    if (toBank === 'External' || fromBank === 'External') {
      return 'Комиссия: 0.95%';
    }

    return 'Комиссия: 0 ₸ (Open Banking Tariff)';
  }, [fromBank, toBank]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchDashboardData();
        if (!isMounted) return;
        setDashboardData(data);
      } catch (e) {
        if (!isMounted) return;
        setError('Не удалось загрузить данные дашборда.');
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    const handleAccountsUpdated = () => {
      load();
    };
    window.addEventListener('finhub:accounts-updated', handleAccountsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('finhub:accounts-updated', handleAccountsUpdated);
    };
  }, []);

  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6 sm:gap-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute left-[-10%] top-[-10%] h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-10%] top-1/3 h-72 w-72 rounded-full bg-yellow-400/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/3 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="glass-panel flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 ring-2 ring-emerald-500/60">
            <span className="text-lg font-semibold text-emerald-300">S</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Добро пожаловать</p>
            <p className="text-base font-semibold text-slate-50 sm:text-lg">
              {user?.email ?? 'Пользователь FinHub'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 shadow-sm sm:flex">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
            Unified Scoring: <span className="font-semibold text-emerald-100">780</span>
          </div>

          <button
            type="button"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/70 text-slate-200 shadow-md transition hover:border-slate-500 hover:bg-slate-800"
          >
            <span className="absolute right-1.5 top-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
            <span className="sr-only">Уведомления</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="h-4 w-4"
            >
              <path d="M8 10a4 4 0 1 1 8 0c0 2 .5 3.5 1 4.5.5 1 .5 1.5.5 1.5H6.5s0-.5.5-1.5 1-2.5 1-4.5Z" />
              <path d="M10 18a2 2 0 1 0 4 0" />
            </svg>
          </button>
        </div>
      </header>

      {/* KYC banner */}
      {user && !user.isKycVerified && (
        <div className="glass-soft flex items-center justify-between border-amber-400/60 bg-amber-500/10 px-4 py-3 text-xs text-amber-50 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-200">
              !
            </span>
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                Требуется подтверждение личности
              </p>
              <p className="text-[11px] text-amber-100/90">
                Для доступа к переводу средств и повышенным лимитам завершите KYC‑верификацию.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ml-3 hidden rounded-full bg-amber-300 px-3 py-1 text-[11px] font-semibold text-amber-950 shadow-sm shadow-amber-300/60 transition hover:bg-amber-200 sm:inline-flex"
            onClick={() => navigate('/kyc')}
          >
            Пройти верификацию
          </button>
        </div>
      )}

      {/* Layout grid */}
      <main className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)]">
        {/* Left column */}
        <section className="flex flex-col gap-5">
          {/* Total Balance */}
          <div className="glass-panel relative overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
            <div className="pointer-events-none absolute inset-y-0 right-[-30%] w-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="pointer-events-none absolute inset-y-8 left-[-30%] w-1/2 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative space-y-2">
                <div className="pill mb-1 bg-slate-900/70 text-[11px] text-slate-300">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Все счета синхронизированы
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Общий баланс</p>
                <p className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                  {loading && !dashboardData
                    ? '—'
                    : formatCurrency(totalBalance).replace('KZT', '₸')}
                </p>
                <p className="text-xs text-slate-300 sm:text-sm">
                  Доступно:{' '}
                  <span className="font-semibold text-emerald-300">
                    {formatCurrency(availableBalance).replace('KZT', '₸')}
                  </span>{' '}
                  после изоляции Smart Pocket
                </p>
                <p className="text-xs text-slate-400 sm:text-sm">
                  Аггрегировано из Kaspi, Freedom, Halyk
                </p>
              </div>

              <div className="relative flex flex-col items-stretch gap-3 sm:items-end">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50 sm:text-sm"
                  onClick={() => setIsMergeModalOpen(true)}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-md bg-emerald-950/20">
                    ⇄
                  </span>
                  Объединить средства
                </button>
                <p className="text-[11px] text-slate-400 sm:text-xs">
                  Прямой перевод между банками без комиссий внутри FinHub
                </p>
              </div>
            </div>
          </div>

          {/* Bank Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Kaspi */}
            <article className="glass-soft relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-amber-400/10 to-transparent" />
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    Kaspi Gold
                  </span>
                  <span className="pill border-amber-300/40 bg-amber-400/10 text-[10px] text-amber-100">
                    Синхронизировано
                  </span>
                </div>
                <div>
                  <p className="text-[11px] text-amber-100/80">Доступно</p>
                  <p className="mt-1 text-xl font-semibold text-amber-50">
                    {formatCurrency(dashboardData?.kaspiBalance ?? 0).replace('KZT', '₸')}
                  </p>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-amber-100/80">
                  <span>Kaspi Red •••• 9214</span>
                  <span>Кэшбэк 5%</span>
                </div>
              </div>
            </article>

            {/* Freedom */}
            <article className="glass-soft relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-400/25 via-emerald-500/10 to-transparent" />
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    Freedom
                  </span>
                  <span className="pill border-emerald-300/50 bg-emerald-400/10 text-[10px] text-emerald-100">
                    Синхронизировано
                  </span>
                </div>
                <div>
                  <p className="text-[11px] text-emerald-100/80">Доступно</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-50">
                    {formatCurrency(dashboardData?.freedomBalance ?? 0).replace('KZT', '₸')}
                  </p>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-emerald-100/80">
                  <span>Freedom Card •••• 4412</span>
                  <span>Инвесткопилка активна</span>
                </div>
              </div>
            </article>

            {/* Halyk */}
            <article className="glass-soft relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-yellow-300/25 via-lime-300/10 to-transparent" />
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-yellow-100">
                    Halyk
                  </span>
                  <span className="pill border-yellow-200/60 bg-yellow-300/10 text-[10px] text-yellow-50">
                    Синхронизировано
                  </span>
                </div>
                <div>
                  <p className="text-[11px] text-yellow-50/80">Доступно</p>
                  <p className="mt-1 text-xl font-semibold text-yellow-50">
                    {formatCurrency(dashboardData?.halykBalance ?? 0).replace('KZT', '₸')}
                  </p>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-yellow-50/80">
                  <span>Halyk Bank •••• 7773</span>
                  <span>Зарплатный проект</span>
                </div>
              </div>
            </article>
          </div>

          {/* Smart Pocket */}
          <section className="glass-panel px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Smart Pocket</p>
                <p className="mt-1 text-sm font-medium text-slate-100 sm:text-base">
                  Изолируйте деньги, которые нельзя потратить
                </p>
              </div>
              <div className="pill bg-emerald-500/10 text-[11px] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Изоляция до конца месяца
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs text-slate-400">Сумма к заморозке</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-50">
                    {formatCurrency(smartPocket).replace('KZT', '₸')}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <div className="space-y-1">
                    <p>Рекомендуемый минимум</p>
                    <p className="font-medium text-slate-100">
                      {formatCurrency(200000).replace('KZT', '₸')}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-slate-700/70" />
                  <div className="space-y-1">
                    <p>Риск перерасхода</p>
                    <p className="font-medium text-amber-300">Низкий</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  min={50000}
                  max={1000000}
                  step={10000}
                  value={smartPocket}
                  onChange={(e) => setSmartPocket(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-800/80 accent-emerald-400"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>₸50 000</span>
                  <span>₸1 000 000</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>Деньги будут недоступны до</span>
                  <span className="rounded-full bg-slate-800/80 px-2 py-0.5 font-medium text-slate-100">
                    30 апреля
                  </span>
                  <span>за исключением экстренных случаев</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 shadow-sm transition hover:border-slate-400 hover:bg-slate-800 sm:flex-none"
                  >
                    Сценарий расходов
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 sm:flex-none"
                  >
                    Активировать изоляцию
                  </button>
                </div>
              </div>
            </div>
          </section>
        </section>

        {/* Right column */}
        <section className="flex flex-col gap-5">
          {error && (
            <section className="glass-soft border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
              {error}
            </section>
          )}

          {/* Analytics */}
          <section className="glass-panel flex flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Аналитика</p>
                <p className="mt-1 text-sm font-medium text-slate-100 sm:text-base">
                  Доходы vs Расходы за неделю
                </p>
              </div>
              <div className="pill bg-slate-900/70 text-[11px] text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                {loading || !dashboardData
                  ? 'Загрузка аналитики...'
                  : `Средний чистый поток: ${formatCurrency(
                      dashboardData.analytics.reduce(
                        (acc, d) => acc + (d.income - d.expense),
                        0
                      ) / dashboardData.analytics.length
                    ).replace('KZT', '₸')}`}
              </div>
            </div>

            <div className="mt-1 h-52 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dashboardData?.analytics ?? []}
                  margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: '#4b5563', strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderRadius: '12px',
                      border: '1px solid rgba(148,163,184,0.4)',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: '#e5e7eb'
                    }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value as number).replace('KZT', '₸'),
                      name === 'income' ? 'Доходы' : 'Расходы'
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#22c55e"
                    strokeWidth={2.2}
                    dot={{ r: 3, strokeWidth: 1, stroke: '#bbf7d0', fill: '#22c55e' }}
                    name="income"
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="#f97373"
                    strokeWidth={2.2}
                    dot={{ r: 3, strokeWidth: 1, stroke: '#fecaca', fill: '#ef4444' }}
                    name="expense"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Unified Scoring mini card */}
          <section className="glass-soft flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Unified Scoring</p>
              <p className="mt-1 text-sm text-slate-200">
                Объединенный скоринг по всем банкам и продуктам
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-400">Текущий скоринг</span>
                <span className="text-2xl font-semibold text-emerald-400">780</span>
              </div>
              <div className="h-12 w-1 rounded-full bg-slate-800">
                <div className="h-7 w-full rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_0_16px_rgba(34,197,94,0.7)]" />
              </div>
            </div>
          </section>

        </section>
      </main>

      {/* Merge funds modal */}
      <AnimatePresence>
        {isMergeModalOpen && (
          <motion.div
            className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-panel relative w-full max-w-md px-5 py-5 sm:px-6 sm:py-6"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full bg-slate-900/60 p-1 text-slate-400 hover:text-slate-100"
                onClick={() => setIsMergeModalOpen(false)}
              >
                <span className="sr-only">Закрыть</span>
                ×
              </button>
              <div className="mb-4 space-y-1 pr-6">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Объединить средства
                </p>
                <p className="text-sm font-medium text-slate-100">
                  Выберите маршрут перевода для оптимальной комиссии
                </p>
                <p className="text-xs text-slate-400">
                  FinHub использует тарифы Open Banking, чтобы предложить маршруты с 0% комиссии.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Откуда</label>
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    value={fromBank}
                    onChange={(e) =>
                      setFromBank(e.target.value as
                        | 'Kaspi'
                        | 'Freedom'
                        | 'Halyk'
                        | 'Unified'
                        | 'External')
                    }
                  >
                    <option value="Kaspi">Kaspi Gold</option>
                    <option value="Freedom">Freedom</option>
                    <option value="Halyk">Halyk</option>
                    <option value="Unified">Единый счёт FinHub</option>
                    <option value="External">Сторонние реквизиты</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Куда</label>
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/50 focus:border-emerald-400 focus:ring-1"
                    value={toBank}
                    onChange={(e) =>
                      setToBank(e.target.value as
                        | 'Kaspi'
                        | 'Freedom'
                        | 'Halyk'
                        | 'Unified'
                        | 'External')
                    }
                  >
                    <option value="Unified">Единый счёт FinHub (0%)</option>
                    <option value="Kaspi">Kaspi Gold</option>
                    <option value="Freedom">Freedom</option>
                    <option value="Halyk">Halyk</option>
                    <option value="External">Сторонние реквизиты</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-xs text-slate-200">
                  <p className="font-medium text-emerald-300">{commissionDescription}</p>
                  <p className="mt-1 text-slate-400">
                    Для переводов через инфраструктуру Нацбанка FinHub выбирает маршрут без комиссии,
                    где это возможно.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-slate-200"
                    onClick={() => setIsMergeModalOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50"
                  >
                    Смоделировать перевод
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DashboardPage;
