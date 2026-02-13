import { ReactNode } from 'react';

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
};

const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="relative w-full max-w-md">
        <div className="pointer-events-none absolute -left-16 -top-24 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-16 h-52 w-52 rounded-full bg-sky-500/15 blur-3xl" />

        <div className="glass-panel relative px-6 py-6 sm:px-7 sm:py-7">
          <div className="mb-5 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
              FinHub Onboarding
            </p>
            <h1 className="text-lg font-semibold text-slate-50 sm:text-xl">{title}</h1>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

