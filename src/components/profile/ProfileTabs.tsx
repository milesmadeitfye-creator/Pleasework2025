import { Link, useLocation } from 'react-router-dom';

const profileTabs = [
  { label: 'Overview', href: '/profile' },
  { label: 'Connect Accounts', href: '/profile/connect' },
  { label: 'Genres & Similar Artists', href: '/profile/identity' },
];

export function ProfileTabs() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === '/profile') {
      return location.pathname === '/profile';
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <div className="mb-6 overflow-x-auto scrollbar-none">
      <div className="inline-flex gap-2 rounded-full bg-white/5 p-1 min-w-min">
        {profileTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={[
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all',
                active
                  ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_18px_rgba(26,108,255,0.6)]'
                  : 'bg-transparent text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white'
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
