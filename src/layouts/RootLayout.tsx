import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavigation from '../components/BottomNavigation';
import SideNavigation from '../components/SideNavigation';
import { useUser } from '../context/UserContext';

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  const { isAuthenticated } = useUser();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
          ? `pb-20 md:pb-0 md:pl-20 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`
          : ''
      }`}
    >
      {showAppNavigation && (
        <SideNavigation isCollapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />
      )}
      {children}
      {showAppNavigation && <BottomNavigation />}
    </div>
  );
};

export default RootLayout;
