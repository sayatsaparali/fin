import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthLayout from '../layouts/AuthLayout';
import { useUser } from '../context/UserContext';

type Method = 'document' | 'biometric';

const KycPage = () => {
  const { completeKyc } = useUser();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('document');
  const [isScanning, setIsScanning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    if (isScanning) {
      timer = window.setTimeout(() => {
        setIsScanning(false);
        setIsDone(true);
        completeKyc();
        navigate('/dashboard');
      }, 2200);
    }
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [isScanning, completeKyc, navigate]);

  const startScan = () => {
    setIsDone(false);
    setIsScanning(true);
  };

  return (
    <AuthLayout
      title="Верификация личности"
      subtitle="Для доступа к полному функционалу FinHub подтвердите свою личность."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMethod('document')}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              method === 'document'
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
                : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
            }`}
          >
            <span className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Шаг 1
            </span>
            <span className="mt-1 block font-medium">Удостоверение личности</span>
            <span className="mt-1 block text-[11px] text-slate-400">
              Загрузка фото документа.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('biometric')}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              method === 'biometric'
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
                : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
            }`}
          >
            <span className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Шаг 1
            </span>
            <span className="mt-1 block font-medium">Face ID / Биометрия</span>
            <span className="mt-1 block text-[11px] text-slate-400">
              Короткий liveness‑чек.
            </span>
          </button>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-xs text-slate-200">
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Имитация процесса верификации
          </p>
          <div className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
            <motion.div
              className="relative h-32 rounded-lg border border-dashed border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"
              animate={
                isScanning
                  ? {
                      boxShadow: [
                        '0 0 0 0 rgba(45,212,191,0.0)',
                        '0 0 0 8px rgba(45,212,191,0.18)',
                        '0 0 0 0 rgba(45,212,191,0.0)'
                      ]
                    }
                  : {}
              }
              transition={
                isScanning
                  ? {
                      duration: 1.4,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }
                  : undefined
              }
            >
              <motion.div
                className="pointer-events-none absolute inset-x-4 top-2 h-10 rounded-full bg-gradient-to-b from-emerald-400/60 to-transparent"
                animate={
                  isScanning
                    ? {
                        y: ['0%', '140%']
                      }
                    : undefined
                }
                transition={
                  isScanning
                    ? {
                        duration: 1.6,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }
                    : undefined
                }
              />
              <div className="relative flex h-full items-center justify-center">
                {method === 'document' ? (
                  <span className="text-[11px] text-slate-300">
                    Сканирование границ удостоверения личности…
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-300">
                    Отслеживание ключевых точек лица…
                  </span>
                )}
              </div>
            </motion.div>
          </div>

          <button
            type="button"
            disabled={isScanning}
            onClick={startScan}
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-400 hover:shadow-emerald-400/50 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            {isScanning ? 'Верификация в процессе…' : 'Начать верификацию'}
          </button>

          {isDone && (
            <p className="text-[11px] text-emerald-300">
              Верификация успешно пройдена. Перенаправляем в Dashboard…
            </p>
          )}

          <p className="text-[10px] text-slate-500">
            Для демо‑версии FinHub верификация проходит локально и не отправляет реальные документы.
            В продакшене здесь будет подключение к провайдерам KYC.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default KycPage;

