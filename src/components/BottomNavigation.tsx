import { NavLink } from 'react-router-dom';
import { navigationItems } from './navigationItems';

const BottomNavigation = () => {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700/80 bg-gray-900/90 pt-1 shadow-[0_-8px_26px_rgba(2,6,23,0.65)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'calc(var(--fh-safe-bottom) + 0.35rem)' }}
      aria-label="Мобильная навигация FinHub"
    >
      <ul className="grid grid-cols-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition ${
                    isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`rounded-xl px-2 py-1 transition ${
                        isActive ? 'bg-emerald-500/15 shadow-[0_0_14px_rgba(16,185,129,0.22)]' : ''
                      }`}
                    >
                      <Icon size={19} strokeWidth={2.1} />
                    </span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNavigation;
