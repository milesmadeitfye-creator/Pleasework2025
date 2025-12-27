import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  Link as LinkIcon,
  DollarSign,
  Music,
  Calendar,
  BarChart3,
  Sparkles,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { OverviewHeader } from './components/OverviewHeader';
import { OverviewTodoBanner } from './components/OverviewTodoBanner';
import MetaApprovalTracker from '../../components/meta/MetaApprovalTracker';
import { isSafeMode, enableSafeMode, disableSafeMode } from '../../debug/safeMode';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import InteractiveTutorial from '../../components/InteractiveTutorial';
import TourLauncher from '../../components/tour/TourLauncher';
import ContextualGuide from '../../components/tour/ContextualGuide';
import ActionCoach from '../../components/tour/ActionCoach';

interface OverviewStats {
  totalLinks: number;
  totalClicks: number;
  totalFans: number;
  walletBalance: number;
  activeCampaigns: number;
  upcomingTasks: number;
}

function useDisplayName() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('there');

  useEffect(() => {
    if (!user) {
      setDisplayName('there');
      return;
    }

    const fetchDisplayName = async () => {
      try {
        // Guard: Check if supabase is configured
        if (!supabase) {
          console.warn('[Overview] Supabase not configured, using fallback name');
          const fallback = user.email?.split('@')[0] || 'there';
          setDisplayName(fallback);
          return;
        }

        // Only fetch display_name to avoid column dependency issues
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();

        // If column error, fall back silently (don't spam console)
        if (error) {
          console.warn('[Overview] Profile fetch failed, using fallback:', error.message);
        }

        const name =
          profile?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'there';

        const firstName = name.split(' ')[0] || name;
        setDisplayName(firstName);
      } catch (error) {
        console.warn('[Overview] Display name error, using fallback:', error);
        const fallback = user.email?.split('@')[0] || 'there';
        setDisplayName(fallback);
      }
    };

    fetchDisplayName();
  }, [user]);

  return displayName;
}

const LOAD_TIMEOUT_MS = 5000;

export default function OverviewPage() {
  const { user } = useAuth();
  const displayName = useDisplayName();
  const [stats, setStats] = useState<OverviewStats>({
    totalLinks: 0,
    totalClicks: 0,
    totalFans: 0,
    walletBalance: 0,
    activeCampaigns: 0,
    upcomingTasks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);
  const [safeMode] = useState(isSafeMode());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setUiError('No user session found. Please sign in again.');
      return;
    }

    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Watchdog: force exit loading after 5s
    timeoutId = setTimeout(() => {
      if (!mounted) return;
      console.error('[Overview] Loading timed out after 5s');
      setLoading(false);
      setTimedOut(true);
      setUiError('Overview loading timed out. The page took too long to respond.');

      try {
        localStorage.setItem('__ghoste_last_crash_v1', JSON.stringify({
          time: new Date().toISOString(),
          kind: 'overview_timeout',
          message: 'Overview loading exceeded 5s',
          path: location.pathname + location.search + location.hash,
          user_id: user.id
        }));
      } catch {}
    }, LOAD_TIMEOUT_MS);

    // Load data with proper cleanup
    (async () => {
      try {
        await loadOverviewData();
      } catch (error: any) {
        if (!mounted) return;
        const errorMessage = error?.message || String(error);
        console.error('[Overview] Load error:', error);
        setUiError(`Failed to load overview: ${errorMessage}`);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user]);

  const loadOverviewData = async () => {
    if (!user) {
      setUiError('No user session found. Please sign in again.');
      return;
    }

    // Guard: Check if supabase is configured
    if (!supabase) {
      console.warn('[Overview] Supabase not configured. Showing empty dashboard.');
      setUiError('Database not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify env.');
      return;
    }

    // Safe mode: skip all queries
    if (safeMode) {
      console.log('[Overview] Safe mode enabled - skipping data queries');
      return;
    }

    try {
      setUiError(null);
      setTimedOut(false);

      // Use allSettled for resilience - never let one failure block the page
      const results = await Promise.allSettled([
        supabase
          .from('oneclick_links')
          .select('clicks')
          .eq('user_id', user.id),

        supabase
          .from('fan_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),

        supabase.rpc('wallet_read', { p_user_id: user.id }).maybeSingle(),

        supabase
          .from('meta_ad_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE'),

        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .gte('due_at', new Date().toISOString()),

        supabase
          .from('oneclick_links')
          .select('id, title, slug, created_at, clicks')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      // Extract results with defaults - never fail on individual errors
      const linksRes = results[0].status === 'fulfilled' ? results[0].value : { data: null, error: null };
      const fansRes = results[1].status === 'fulfilled' ? results[1].value : { count: 0, error: null };
      const walletRes = results[2].status === 'fulfilled' ? results[2].value : { data: null, error: null };
      const campaignsRes = results[3].status === 'fulfilled' ? results[3].value : { count: 0, error: null };
      const tasksRes = results[4].status === 'fulfilled' ? results[4].value : { count: 0, error: null };
      const activityRes = results[5].status === 'fulfilled' ? results[5].value : { data: [], error: null };

      // Log warnings only for failed fetches (no errors in prod)
      if (results[0].status === 'rejected') console.warn('[Overview] Links fetch failed');
      if (results[1].status === 'rejected') console.warn('[Overview] Fans fetch failed');
      if (results[2].status === 'rejected') console.warn('[Overview] Wallet fetch failed');
      if (results[3].status === 'rejected') console.warn('[Overview] Campaigns fetch failed');
      if (results[4].status === 'rejected') console.warn('[Overview] Tasks fetch failed');
      if (results[5].status === 'rejected') console.warn('[Overview] Activity fetch failed');

      const totalClicks = linksRes.data?.reduce((sum, link) => sum + (link.clicks || 0), 0) || 0;

      // Handle wallet RPC - fallback to defaults if unavailable
      let walletBalance = 0;
      if (walletRes.error) {
        console.warn('[Overview] wallet_read unavailable, using defaults');
        walletBalance = 0;
      } else if (walletRes.data) {
        // wallet_read returns { tools_balance, manager_balance }
        const toolsBalance = walletRes.data.tools_balance || 0;
        const managerBalance = walletRes.data.manager_balance || 0;
        walletBalance = toolsBalance + managerBalance;
      }

      setStats({
        totalLinks: linksRes.data?.length || 0,
        totalClicks,
        totalFans: fansRes.count || 0,
        walletBalance,
        activeCampaigns: campaignsRes.count || 0,
        upcomingTasks: tasksRes.count || 0,
      });

      setRecentActivity(activityRes.data || []);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.warn('[Overview] Error loading data, using defaults:', error);
      setUiError(`Failed to load overview data: ${errorMessage}`);

      // Don't crash - set default stats
      setStats({
        totalLinks: 0,
        totalClicks: 0,
        totalFans: 0,
        walletBalance: 0,
        activeCampaigns: 0,
        upcomingTasks: 0,
      });
      throw error; // Re-throw so outer handler can log it
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ghoste-navy flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue mx-auto mb-4"></div>
          <div className="text-slate-400 text-sm">Loading overview...</div>
          <div className="text-slate-500 text-xs mt-2">If this takes more than 5 seconds, something is wrong</div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Smart Links',
      value: stats.totalLinks,
      icon: LinkIcon,
      href: '/studio/smart-links',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      label: 'Total Clicks',
      value: stats.totalClicks.toLocaleString(),
      icon: TrendingUp,
      href: '/analytics',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      label: 'Fan Contacts',
      value: stats.totalFans,
      icon: Users,
      href: '/studio/fan-communication',
      color: 'from-purple-500 to-pink-500',
    },
    {
      label: 'Wallet Balance',
      value: `${stats.walletBalance.toLocaleString()} credits`,
      icon: DollarSign,
      href: '/wallet',
      color: 'from-amber-500 to-orange-500',
    },
    {
      label: 'Active Campaigns',
      value: stats.activeCampaigns,
      icon: BarChart3,
      href: '/studio/ad-campaigns',
      color: 'from-red-500 to-rose-500',
    },
    {
      label: 'Upcoming Tasks',
      value: stats.upcomingTasks,
      icon: Calendar,
      href: '/calendar',
      color: 'from-indigo-500 to-blue-500',
    },
  ];

  const quickActions = [
    {
      label: 'Create Smart Link',
      href: '/studio/smart-links',
      icon: LinkIcon,
      description: 'Share your music everywhere',
    },
    {
      label: 'Talk to My Manager',
      href: '/manager',
      icon: Sparkles,
      description: 'AI-powered music career assistant',
    },
    {
      label: 'Create Content',
      href: '/studio/cover-art',
      icon: Music,
      description: 'Generate cover art & videos',
    },
    {
      label: 'Run Ad Campaign',
      href: '/studio/ad-campaigns',
      icon: TrendingUp,
      description: 'Promote your music with Meta Ads',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#0A0E1A] to-[#020617]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-8 space-y-6">
        <OverviewHeader
          displayName={displayName}
          isLoading={loading}
          onRefresh={loadOverviewData}
        />

        <OverviewTodoBanner />

        {/* Master Product Tour Banner */}
        <TourLauncher variant="banner" />

        {/* Getting Started Checklist */}
        <OnboardingChecklist />

        {/* Interactive Tutorial (Legacy) */}
        <InteractiveTutorial />

        {/* Contextual Guide (Auto-triggers on page visits) */}
        <ContextualGuide />

        {/* Action Coach (Behavior-triggered coaching) */}
        <ActionCoach />

        {/* Safe Mode Banner */}
        {safeMode && (
          <div className="rounded-2xl border border-yellow-900/50 bg-yellow-900/10 p-5">
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className="w-6 h-6 text-yellow-400" />
              <div className="text-yellow-400 font-semibold text-lg">Safe Mode Enabled</div>
            </div>
            <div className="text-yellow-200/80 text-sm mb-4">
              Data queries are disabled. This prevents crashes but shows no real data.
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  disableSafeMode();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Disable Safe Mode & Reload
              </button>
              <Link
                to="/listening-parties"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Go to Listening Parties
              </Link>
            </div>
          </div>
        )}

        {/* UI Error Panel */}
        {uiError && !safeMode && (
          <div className={`rounded-2xl border p-5 ${
            timedOut
              ? 'border-orange-900/50 bg-orange-900/10'
              : 'border-red-900/50 bg-red-900/10'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <AlertCircle className={`w-6 h-6 ${timedOut ? 'text-orange-400' : 'text-red-400'}`} />
              <div className={`font-semibold text-lg ${timedOut ? 'text-orange-400' : 'text-red-400'}`}>
                {timedOut ? 'Overview Timed Out' : 'Overview Data Error'}
              </div>
            </div>
            <div className={`text-sm mb-4 font-mono break-all ${
              timedOut ? 'text-orange-200/80' : 'text-red-200/80'
            }`}>
              {uiError}
            </div>
            {timedOut && (
              <div className="text-orange-200/70 text-xs mb-4 bg-orange-950/30 p-3 rounded-lg border border-orange-900/30">
                <div className="font-semibold mb-1">What happened:</div>
                The page waited 5 seconds but data didn't load. This is logged to /debug for investigation.
                <div className="mt-2 font-semibold">Try:</div>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Check your internet connection</li>
                  <li>Click "Retry Overview" below</li>
                  <li>Open /debug to see timeout details</li>
                  <li>Enable Safe Mode if problem persists</li>
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setLoading(true);
                  setUiError(null);
                  setTimedOut(false);
                  window.location.reload();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Retry Overview
              </button>
              <button
                onClick={() => {
                  enableSafeMode();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Enable Safe Mode
              </button>
              <Link
                to="/debug"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors text-sm border border-gray-700"
              >
                Open Debug Console
              </Link>
              <Link
                to="/listening-parties"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors text-sm border border-gray-700"
              >
                Go to Listening Parties
              </Link>
            </div>
          </div>
        )}

        {false && (
          <>
            {/* Meta approval / pinger UI intentionally hidden from Overview */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-white font-semibold text-lg">Promotion Readiness</div>
              <div className="mt-1 text-white/60 text-sm">
                Meta approval is the gate. Once this tracker hits green, resubmit access and Ads Management can go live.
              </div>
            </div>

            <MetaApprovalTracker />
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                to={card.href}
                className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.7)] transition-all hover:border-blue-500/50 hover:scale-[1.02]"
              >
                <div className="pointer-events-none absolute -right-10 -top-8 h-24 w-24 rounded-full bg-blue-500/5 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />

                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {card.label}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-50">
                      {card.value}
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900/80 flex-shrink-0">
                    <Icon className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.7)]">
            <h2 className="text-xl font-semibold text-slate-50 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    to={action.href}
                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800/50 hover:border-blue-500/50 transition-all group"
                  >
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-50">{action.label}</p>
                      <p className="text-sm text-slate-400">{action.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.7)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-50">Recent Smart Links</h2>
              <Link
                to="/studio/smart-links"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all
              </Link>
            </div>

            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <LinkIcon className="w-12 h-12 text-slate-500/50 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No smart links yet</p>
                <Link
                  to="/studio/smart-links"
                  className="inline-flex items-center gap-2 mt-3 text-sm text-blue-400 hover:text-blue-300"
                >
                  Create your first link
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-50 truncate">
                        {link.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(link.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-slate-50">
                        {link.clicks || 0}
                      </p>
                      <p className="text-xs text-slate-400">clicks</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
