import { useState, useEffect } from 'react';
import { X, AlertCircle, TrendingUp, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { actionCoachingRules, type ActionCoaching } from '../../lib/tourContent';

export default function ActionCoach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeCoaching, setActiveCoaching] = useState<ActionCoaching | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (user) {
      checkForCoaching();
    }
  }, [user]);

  const checkForCoaching = async () => {
    if (!user) return;

    try {
      // Check various conditions and trigger coaching
      await checkLinkNotShared();
      await checkCreditsLow();
      // Add more checks as needed
    } catch (err) {
      console.error('Error checking coaching:', err);
    }
  };

  const checkLinkNotShared = async () => {
    if (!user) return;

    // Check if user created a link but has 0 clicks after 24 hours
    const { data: links } = await supabase
      .from('smart_links')
      .select('id, created_at, clicks')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (links && links.length > 0) {
      const recentLinkWithNoClicks = links.find((link) => {
        const createdAt = new Date(link.created_at);
        const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
        return hoursSinceCreation > 1 && (link.clicks || 0) === 0;
      });

      if (recentLinkWithNoClicks) {
        // Check if we've already shown this coaching
        const { data: existing } = await supabase
          .from('user_action_coaching')
          .select('*')
          .eq('user_id', user.id)
          .eq('coaching_id', 'link-created-not-shared')
          .maybeSingle();

        if (!existing) {
          const coaching = actionCoachingRules.find((r) => r.id === 'link-created-not-shared');
          if (coaching) {
            setActiveCoaching(coaching);
            setIsVisible(true);

            await supabase.from('user_action_coaching').insert({
              user_id: user.id,
              coaching_id: coaching.id,
              triggered_at: new Date().toISOString(),
            });
          }
        }
      }
    }
  };

  const checkCreditsLow = async () => {
    if (!user) return;

    try {
      // Call wallet RPC to get balance
      const { data: wallet } = await supabase.rpc('wallet_read', {
        p_user_id: user.id,
      });

      if (wallet) {
        const totalBalance = (wallet.tools_balance || 0) + (wallet.manager_balance || 0);

        // If balance is below 20% of free tier (1500 credits)
        if (totalBalance < 1500 && totalBalance > 0) {
          const { data: existing } = await supabase
            .from('user_action_coaching')
            .select('*')
            .eq('user_id', user.id)
            .eq('coaching_id', 'credits-running-low')
            .maybeSingle();

          if (!existing) {
            const coaching = actionCoachingRules.find((r) => r.id === 'credits-running-low');
            if (coaching) {
              setActiveCoaching(coaching);
              setIsVisible(true);

              await supabase.from('user_action_coaching').insert({
                user_id: user.id,
                coaching_id: coaching.id,
                triggered_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (err) {
      // Wallet RPC might not exist, fail silently
    }
  };

  const handleDismiss = async () => {
    if (!user || !activeCoaching) return;

    try {
      await supabase
        .from('user_action_coaching')
        .update({
          dismissed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('coaching_id', activeCoaching.id);

      setIsVisible(false);
      setTimeout(() => setActiveCoaching(null), 300);
    } catch (err) {
      console.error('Error dismissing coaching:', err);
    }
  };

  const handleAction = async () => {
    if (!user || !activeCoaching) return;

    try {
      await supabase
        .from('user_action_coaching')
        .update({
          action_taken: true,
          dismissed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('coaching_id', activeCoaching.id);

      navigate(activeCoaching.ctaPath);
      setIsVisible(false);
      setTimeout(() => setActiveCoaching(null), 300);
    } catch (err) {
      console.error('Error taking action:', err);
    }
  };

  if (!activeCoaching || !isVisible) return null;

  const IconComponent =
    activeCoaching.priority === 'high'
      ? AlertCircle
      : activeCoaching.priority === 'medium'
      ? TrendingUp
      : MessageCircle;

  const colorClass =
    activeCoaching.priority === 'high'
      ? 'from-red-900/95 to-red-950/95 border-red-700/50'
      : activeCoaching.priority === 'medium'
      ? 'from-orange-900/95 to-orange-950/95 border-orange-700/50'
      : 'from-blue-900/95 to-blue-950/95 border-blue-700/50';

  return (
    <div
      className={`fixed bottom-6 left-6 w-96 bg-gradient-to-br ${colorClass} backdrop-blur-xl border rounded-2xl shadow-2xl p-6 z-50 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              activeCoaching.priority === 'high'
                ? 'bg-red-500/20'
                : activeCoaching.priority === 'medium'
                ? 'bg-orange-500/20'
                : 'bg-blue-500/20'
            }`}
          >
            <IconComponent
              className={`w-5 h-5 ${
                activeCoaching.priority === 'high'
                  ? 'text-red-400'
                  : activeCoaching.priority === 'medium'
                  ? 'text-orange-400'
                  : 'text-blue-400'
              }`}
            />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{activeCoaching.title}</h3>
            <p className="text-xs text-gray-300">Coaching</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <p className="text-gray-200 text-sm leading-relaxed mb-4">{activeCoaching.description}</p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleAction}
          className={`flex-1 px-4 py-2 font-medium rounded-lg transition-colors text-sm ${
            activeCoaching.priority === 'high'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : activeCoaching.priority === 'medium'
              ? 'bg-orange-600 hover:bg-orange-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {activeCoaching.cta}
        </button>
        <button
          onClick={handleDismiss}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
