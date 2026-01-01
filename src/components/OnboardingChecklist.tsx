import { useState, useEffect } from 'react';
import { Check, ChevronRight, Link2, Zap, Mail, Share2, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: any;
  path: string;
  helpPath: string;
  checkComplete: () => Promise<boolean>;
}

const checklistItems: ChecklistItem[] = [
  {
    id: 'smart-link',
    title: 'Create your first Smart Link',
    description: 'Share trackable links across all platforms',
    icon: Link2,
    path: '/studio/smart-links',
    helpPath: '/help/smart-links/smart-links-overview',
    checkComplete: async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) return false;

        const { data, error } = await supabase
          .from('smart_links')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq('link_type', 'smart')
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingChecklist] Error checking smart-link:', error);
          return false;
        }

        return !!data;
      } catch (err) {
        console.error('[OnboardingChecklist] Exception checking smart-link:', err);
        return false;
      }
    }
  },
  {
    id: 'one-click-link',
    title: 'Create a One-Click Link',
    description: 'Perfect for Instagram bio and quick shares',
    icon: Zap,
    path: '/studio/smart-links',
    helpPath: '/help/smart-links/smart-links-overview',
    checkComplete: async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) return false;

        const { data, error } = await supabase
          .from('smart_links')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq('link_type', 'one_click')
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingChecklist] Error checking one-click-link:', error);
          return false;
        }

        return !!data;
      } catch (err) {
        console.error('[OnboardingChecklist] Exception checking one-click-link:', err);
        return false;
      }
    }
  },
  {
    id: 'fan-broadcast',
    title: 'Draft your first broadcast',
    description: 'Engage fans with targeted messages',
    icon: Mail,
    path: '/studio/fan-communication',
    helpPath: '/help/fan-communication/broadcasts',
    checkComplete: async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) return false;

        const { data, error } = await supabase
          .from('fan_broadcasts')
          .select('id')
          .eq('user_id', userData.user.id)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingChecklist] Error checking fan-broadcast:', error);
          return false;
        }

        return !!data;
      } catch (err) {
        console.error('[OnboardingChecklist] Exception checking fan-broadcast:', err);
        return false;
      }
    }
  },
  {
    id: 'meta-connect',
    title: 'Connect Meta (optional)',
    description: 'Enable pixel tracking for better ad performance',
    icon: Share2,
    path: '/profile/connected-accounts',
    helpPath: '/help/ads-manager/connecting-meta',
    checkComplete: async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) return false;

        const { data, error } = await supabase
          .from('meta_user_credentials')
          .select('id')
          .eq('user_id', userData.user.id)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingChecklist] Error checking meta-connect:', error);
          return false;
        }

        return !!data;
      } catch (err) {
        console.error('[OnboardingChecklist] Exception checking meta-connect:', err);
        return false;
      }
    }
  },
  {
    id: 'split-invite',
    title: 'Invite a collaborator to splits',
    description: 'Start royalty negotiations with your team',
    icon: Users,
    path: '/studio/splits',
    helpPath: '/help/splits/sending-invite',
    checkComplete: async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) return false;

        const { data, error } = await supabase
          .from('split_negotiations')
          .select('id')
          .eq('owner_user_id', userData.user.id)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingChecklist] Error checking split-invite:', error);
          return false;
        }

        return !!data;
      } catch (err) {
        console.error('[OnboardingChecklist] Exception checking split-invite:', err);
        return false;
      }
    }
  }
];

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [completionStatus, setCompletionStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (user) {
      checkAllItems();
      checkIfDismissed();
    }
  }, [user]);

  const checkIfDismissed = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.preferences?.onboarding_checklist_dismissed) {
        setIsDismissed(true);
      }
    } catch (err) {
      console.error('Error checking dismissed status:', err);
    }
  };

  const checkAllItems = async () => {
    setLoading(true);
    const status: Record<string, boolean> = {};

    for (const item of checklistItems) {
      try {
        status[item.id] = await item.checkComplete();
      } catch (err) {
        console.error(`Error checking ${item.id}:`, err);
        status[item.id] = false;
      }
    }

    setCompletionStatus(status);
    setLoading(false);
  };

  const handleDismiss = async () => {
    if (!user) return;

    try {
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      const preferences = existing?.preferences || {};
      preferences.onboarding_checklist_dismissed = true;

      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          preferences
        });

      setIsDismissed(true);
    } catch (err) {
      console.error('Error dismissing checklist:', err);
    }
  };

  if (!user || loading || isDismissed) return null;

  const completedCount = Object.values(completionStatus).filter(Boolean).length;
  const totalCount = checklistItems.length;
  const isFullyComplete = completedCount === totalCount;
  const progress = (completedCount / totalCount) * 100;

  // Don't show if fully complete
  if (isFullyComplete) return null;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-6 relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-3xl pointer-events-none" />

      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white z-10"
        title="Dismiss checklist"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="relative mb-6">
        <h3 className="text-xl font-bold text-white mb-2">Getting Started</h3>
        <p className="text-sm text-gray-400 mb-4">
          Complete these tasks to get the most out of Ghoste
        </p>

        {/* Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-400">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="relative space-y-3">
        {checklistItems.map((item) => {
          const Icon = item.icon;
          const isComplete = completionStatus[item.id];

          return (
            <div
              key={item.id}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                isComplete
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800'
              }`}
            >
              {/* Icon / Checkmark */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isComplete
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isComplete ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white mb-1">{item.title}</h4>
                <p className="text-xs text-gray-400 mb-2">{item.description}</p>

                {!isComplete && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(item.path)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                    >
                      Start
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <span className="text-gray-600">•</span>
                    <button
                      onClick={() => navigate(item.helpPath)}
                      className="text-xs text-gray-500 hover:text-gray-400"
                    >
                      Learn more
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="relative mt-6 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 text-center">
          Need help? Check out our{' '}
          <button
            onClick={() => navigate('/help')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Help Center
          </button>
          {' '}or{' '}
          <button
            onClick={() => navigate('/studio/ghoste-ai')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            ask Ghoste AI
          </button>
        </p>
      </div>
    </div>
  );
}
