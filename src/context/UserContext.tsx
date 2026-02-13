import { createContext, ReactNode, useContext, useState } from 'react';

type User = {
  email: string;
  isKycVerified: boolean;
} | null;

type UserContextValue = {
  user: User;
  isAuthenticated: boolean;
  login: (email: string) => void;
  logout: () => void;
  completeKyc: () => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User>(null);

  const login = (email: string) => {
    setUser({ email, isKycVerified: false });
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

