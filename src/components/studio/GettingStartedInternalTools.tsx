import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  Mail,
  Link2,
  BarChart3,
  Users,
  Megaphone,
  Settings,
  ExternalLink,
} from 'lucide-react';

interface InternalToolModule {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  status?: 'configured' | 'pending';
}

export const GettingStartedInternalTools: React.FC = () => {
  const navigate = useNavigate();

  const modules: InternalToolModule[] = [
    {
      title: 'Connected Accounts',
      description: 'Connect Spotify, Meta, TikTok, and other platforms to unlock full automation.',
      icon: <Users className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Manage Connections',
        onClick: () => navigate('/profile/connect'),
        variant: 'primary',
      },
    },
    {
      title: 'Analytics Setup',
      description: 'Configure your Spotify artist link to auto-sync monthly listeners, followers, and stats.',
      icon: <BarChart3 className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Configure Analytics',
        onClick: () => navigate('/analytics'),
        variant: 'primary',
      },
    },
    {
      title: 'Smart Links',
      description: 'Create your first smart link to share your music across all platforms with one URL.',
      icon: <Link2 className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Create Smart Link',
        onClick: () => navigate('/studio/smart-links'),
        variant: 'primary',
      },
    },
    {
      title: 'Email & Fan Communication',
      description: 'Set up Mailchimp integration and fan contact sync to build your audience.',
      icon: <Mail className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Configure Email',
        onClick: () => navigate('/studio/fan-communication'),
        variant: 'primary',
      },
    },
    {
      title: 'Ad Campaigns',
      description: 'Launch Meta ad campaigns directly from Ghoste to promote your music and grow your fanbase.',
      icon: <Megaphone className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Create Campaign',
        onClick: () => navigate('/studio/ad-campaigns'),
        variant: 'primary',
      },
    },
    {
      title: 'Tracking Pixels',
      description: 'Configure Meta Pixel and TikTok Pixel IDs for advanced conversion tracking on your links.',
      icon: <Settings className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Manage Pixels',
        onClick: () => navigate('/settings'),
        variant: 'secondary',
      },
    },
    {
      title: 'Onboarding Email Preview',
      description: 'View how each step in the onboarding sequence renders with the Ghoste template.',
      icon: <ExternalLink className="w-5 h-5 text-ghoste-blue" />,
      action: {
        label: 'Open Preview',
        onClick: () => window.open('/internal/onboarding-preview', '_blank'),
        variant: 'secondary',
      },
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-wide text-ghoste-white">
          Set up internal tools
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ghoste-grey">
          Work through these modules to fully unlock Ghoste Studio: connect your tools, wire automations, and get your first systems live.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {modules.map((module, index) => (
          <div
            key={index}
            className="rounded-2xl border border-white/8 bg-white/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all hover:border-white/12 hover:bg-white/8"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="rounded-xl bg-ghoste-blue/10 p-2 shadow-[0_0_18px_rgba(26,108,255,0.3)]">
                  {module.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-ghoste-white mb-1">
                    {module.title}
                  </h3>
                  <p className="text-[11px] leading-relaxed text-ghoste-grey">
                    {module.description}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={module.action.onClick}
                className={`
                  inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all
                  ${
                    module.action.variant === 'secondary'
                      ? 'border border-white/10 bg-ghoste-black/60 text-ghoste-grey hover:bg-ghoste-black hover:text-ghoste-white'
                      : 'border border-white/10 bg-ghoste-blue text-ghoste-white shadow-[0_0_12px_rgba(26,108,255,0.4)] hover:bg-ghoste-blue/90 hover:shadow-[0_0_18px_rgba(26,108,255,0.6)]'
                  }
                `}
              >
                <span>{module.action.label}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
