import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { ensureStandardAccountsForUser } from '../lib/accountsInitializer';
import { getSupabaseClient } from '../lib/supabaseClient';

type User = {
  email: string;
  isKycVerified: boolean;
  emailVerified: boolean;
} | null;

type UserContextValue = {
  user: User;
  isAuthenticated: boolean;
  login: (email: string, emailVerified: boolean) => void;
  logout: () => void;
  completeKyc: () => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User>(null);

  const login = (email: string, emailVerified: boolean) => {
    setUser({ email, isKycVerified: false, emailVerified });
  };

  const logout = () => {
    setUser(null);
  };

  const completeKyc = () => {
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, isKycVerified: true };
    });
  };

  // Попытка восстановить сессию Supabase при монтировании
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user;
      if (!sessionUser?.email) return;

      setUser({
        email: sessionUser.email,
        isKycVerified: false,
        emailVerified: Boolean(sessionUser.email_confirmed_at)
      });

      ensureStandardAccountsForUser(sessionUser.id)
        .then((result) => {
          if (result.created > 0) {
            window.dispatchEvent(new Event('finhub:accounts-updated'));
          }
        })
        .catch((accountsInitError) => {
          // eslint-disable-next-line no-console
          console.error('Failed to auto-initialize standard accounts:', accountsInitError);
        });
    });
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        login,
        logout,
        completeKyc
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};
