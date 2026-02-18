import { NavLink } from 'react-router-dom';
import { navigationItems } from './navigationItems';

const SideNavigation = () => {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden border-r border-slate-700/70 bg-slate-900/85 backdrop-blur-xl md:block md:w-20 lg:w-64">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-700/60 px-3 py-4 lg:px-5 lg:py-5">
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-500/60">
              <span className="text-sm font-semibold text-emerald-300">F</span>
            </div>
            <div className="hidden lg:block">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">FinHub</p>
              <p className="text-sm font-medium text-slate-100">Navigation</p>
            </div>
          </div>
        </div>

        <nav className="px-2 py-4 lg:px-3" aria-label="Sidebar Navigation">
          <ul className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `group flex items-center justify-center rounded-xl px-2 py-2.5 transition lg:justify-start lg:px-3 ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.45)]'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                      }`
                    }
                  >
                    <Icon size={20} strokeWidth={2.1} />
                    <span className="hidden pl-3 text-sm lg:inline">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default SideNavigation;
