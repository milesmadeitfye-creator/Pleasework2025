import { Link, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

export interface GhosteTab {
  label: string;
  to: string;
  icon?: ReactNode;
  badge?: string | number;
  exact?: boolean;
}

interface GhosteTabsNavProps {
  tabs: GhosteTab[];
  className?: string;
}

export function GhosteTabsNav({ tabs, className = '' }: GhosteTabsNavProps) {
  const location = useLocation();

  const isActive = (tab: GhosteTab) => {
    if (tab.exact) {
      return location.pathname === tab.to;
    }
    return location.pathname === tab.to || location.pathname.startsWith(tab.to + '/');
  };

  return (
    <div className={`overflow-x-auto scrollbar-none ${className}`}>
      <div className="inline-flex gap-2 rounded-full bg-white/5 p-1 min-w-min border border-white/10">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={[
                'relative whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium tracking-wide transition-all flex items-center gap-2',
                active
                  ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_20px_rgba(26,108,255,0.6)]'
                  : 'bg-transparent text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white',
                'focus:outline-none focus:ring-2 focus:ring-ghoste-blue focus:ring-offset-2 focus:ring-offset-ghoste-navy'
              ].join(' ')}
            >
              {tab.icon && (
                <span className={active ? 'text-ghoste-white' : 'text-ghoste-grey'}>
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={[
                    'px-1.5 py-0.5 rounded-full text-xs font-semibold',
                    active
                      ? 'bg-white/20 text-ghoste-white'
                      : 'bg-white/10 text-ghoste-grey'
                  ].join(' ')}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
