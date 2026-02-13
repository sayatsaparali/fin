import { ReactNode } from 'react';

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return <div className="min-h-screen bg-slate-950 text-slate-50">{children}</div>;
};

export default RootLayout;

