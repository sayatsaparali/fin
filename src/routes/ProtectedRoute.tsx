import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';

type ProtectedRouteProps = {
  children: ReactElement;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isAuthenticated } = useUser();
  const location = useLocation();

  // Не пустим неавторизованных и пользователей без подтверждённого email
  if (!isAuthenticated || !user?.emailVerified) {
    // Если пользователь есть, но email не подтверждён — отправим на страницу ожидания
    if (user && !user.emailVerified) {
      return <Navigate to="/email-verification" replace state={{ from: location }} />;
    }

    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;

