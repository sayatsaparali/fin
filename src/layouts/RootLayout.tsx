import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavigation from '../components/BottomNavigation';
import SideNavigation from '../components/SideNavigation';
import { useUser } from '../context/UserContext';
import type { UiToastVariant } from '../lib/uiToast';

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  const { isAuthenticated } = useUser();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: UiToastVariant } | null>(null);
  const isPublicRoute =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/email-verification';
  const showAppNavigation = isAuthenticated && !isPublicRoute;

  useEffect(() => {
    const savedState = window.localStorage.getItem('finhub_sidebar_collapsed');
    if (savedState === '1') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const handler = (
      event: Event & {
        detail?: { message?: string; variant?: UiToastVariant };
      }
    ) => {
      const message = String(event.detail?.message ?? '').trim();
      if (!message) return;
      const variant = event.detail?.variant ?? 'error';
      setToast({ message, variant });
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 3200);
    };

    window.addEventListener('finhub:toast', handler as EventListener);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('finhub:toast', handler as EventListener);
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('finhub_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-50 ${
        showAppNavigation
          ? `pb-[calc(5rem+var(--fh-safe-bottom))] md:pb-0 md:pl-20 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`
          : ''
      }`}
    >
      {showAppNavigation && (
        <SideNavigation isCollapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />
      )}
      {children}
      {showAppNavigation && <BottomNavigation />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] md:hidden">
          <div
            className={`rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              toast.variant === 'success'
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                : toast.variant === 'info'
                  ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
                  : 'border-rose-400/50 bg-rose-500/20 text-rose-100'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default RootLayout;
