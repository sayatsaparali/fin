import { LayoutDashboard, Receipt, User, Wallet } from 'lucide-react';

export const navigationItems = [
  { to: '/dashboard', label: 'Главная', icon: LayoutDashboard },
  { to: '/transactions', label: 'Транзакции', icon: Receipt },
  { to: '/transfers', label: 'Переводы', icon: Wallet },
  { to: '/profile', label: 'Профиль', icon: User }
] as const;
