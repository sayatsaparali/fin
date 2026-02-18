import { ReactNode } from 'react';
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
  const isPublicRoute =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/email-verification';
  const showAppNavigation = isAuthenticated && !isPublicRoute;

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-50 ${
        showAppNavigation ? 'pb-20 md:pb-0 md:pl-20 lg:pl-64' : ''
      }`}
    >
      {showAppNavigation && <SideNavigation />}
      {children}
      {showAppNavigation && <BottomNavigation />}
    </div>
  );
};

export default RootLayout;
