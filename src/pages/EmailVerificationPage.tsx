import AuthLayout from '../layouts/AuthLayout';

const EmailVerificationPage = () => {
  return (
    <AuthLayout
      title="Добро пожаловать в FinHub!"
      subtitle="На вашу почту отправлено письмо для подтверждения."
    >
      <div className="space-y-4 text-xs text-slate-200">
        <div className="flex flex-col items-center gap-3 py-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 ring-2 ring-emerald-400/70">
            <span className="text-lg font-semibold text-emerald-300">F</span>
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-slate-100">
              Мы ждём подтверждения вашего email.
            </p>
            <p className="text-[11px] text-slate-400">
              Пожалуйста, проверьте папку <span className="font-semibold text-slate-200">«Входящие»</span>{' '}
              или <span className="font-semibold text-slate-200">«Спам»</span> — письмо от{' '}
              <span className="font-semibold text-emerald-200">FinHub Support</span> уже в пути.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 text-[11px] text-slate-300">
          <p className="font-medium text-slate-100">Что произойдёт дальше?</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Откройте письмо и нажмите на кнопку подтверждения.</li>
            <li>После подтверждения вы сможете вернуться в FinHub и продолжить онбординг.</li>
          </ul>
        </div>

        <p className="text-[10px] text-slate-500">
          Для безопасности мы используем email‑подтверждение вместо мгновенного доступа. Это помогает
          защитить ваш финансовый профиль и подключённые банки.
        </p>
      </div>
    </AuthLayout>
  );
};

export default EmailVerificationPage;

