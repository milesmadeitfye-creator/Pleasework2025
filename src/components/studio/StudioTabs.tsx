import { Link, useLocation } from 'react-router-dom';
import ComingSoonBadge from '../ui/ComingSoonBadge';

const studioTabs = [
  { label: 'Getting Started', href: '/studio/getting-started' },
  { label: 'Smart Links', href: '/studio/smart-links' },
  { label: 'Unreleased Music', href: '/studio/unreleased-music' },
  { label: 'Listening Parties', href: '/studio/listening-parties' },
  { label: 'Cover Art', href: '/studio/cover-art' },
  { label: 'Social Media', href: '/studio/social-media', comingSoon: true },
  { label: 'Split Negotiations', href: '/studio/splits' },
  { label: 'Fan Communication', href: '/studio/fan-communication' },
  { label: 'Ad Campaigns', href: '/studio/ad-campaigns' },
  { label: 'Ads Autopilot', href: '/studio/ads-autopilot' },
  { label: 'Verification Inbox', href: '/studio/ads-verification' },
  { label: 'Autopilot Log', href: '/studio/ads-log' },
  { label: 'Music Visuals', href: '/studio/music-visuals' },
];

export function StudioTabs() {
  const location = useLocation();

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <div className="mb-4 overflow-x-auto ghoste-studio-scrollbars">
      <div className="inline-flex gap-2 rounded-full bg-white/5 p-1 min-w-min">
        {studioTabs.map((tab) => {
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
              <span className="inline-flex items-center">
                {tab.label}
                {tab.comingSoon && <ComingSoonBadge />}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
