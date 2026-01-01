import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { PageShell } from '../../components/layout/PageShell';
import { Target, Link, Upload, Rocket, CheckCircle, AlertCircle } from 'lucide-react';
import { readModeSettings, type GoalSettings, DEFAULT_GOAL_SETTINGS } from '../../lib/ads/modes';
import { GOAL_REGISTRY, type OverallGoalKey, getAssetRequirementsText } from '../../lib/goals';

type Step = 'goals' | 'requirements' | 'creatives' | 'launch';

interface PlanAssets {
  smartlink_url?: string;
  presave_url?: string;
  lead_url?: string;
  facebook_sound_url?: string;
  tiktok_sound_url?: string;
  instagram_profile_url?: string;
  facebook_page_url?: string;
  tiktok_profile_url?: string;
}

interface Creative {
  id: string;
  file: File;
  goalKey: OverallGoalKey;
  caption?: string;
}

export default function AdsPlanFromGoals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('goals');
  const [activeGoals, setActiveGoals] = useState<OverallGoalKey[]>([]);
  const [goalSettings, setGoalSettings] = useState<Record<string, GoalSettings>>({});
  const [planAssets, setPlanAssets] = useState<PlanAssets>({});
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [launching, setLaunching] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  useEffect(() => {
    loadUserGoals();
  }, []);

  async function loadUserGoals() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const settings = await readModeSettings(user.id);
      setGoalSettings(settings.goal_settings);

      const active = Object.entries(settings.goal_settings)
        .filter(([_, s]) => s.is_active)
        .map(([key, _]) => key as OverallGoalKey);

      if (active.length === 0) {
        alert('No active goals found. Please activate goals in your Profile first.');
        navigate('/settings');
        return;
      }

      setActiveGoals(active);

      const storedAssets = (settings.goal_settings as any).__assets || {};
      setPlanAssets(storedAssets);

      setLoading(false);
    } catch (err) {
      console.error('Error loading goals:', err);
      setLoading(false);
    }
  }

  function updateAsset(key: keyof PlanAssets, value: string) {
    setPlanAssets(prev => ({ ...prev, [key]: value }));
  }

  async function resolveSongUrl() {
    if (!songQuery.trim()) {
      setResolveError('Please enter a song query (e.g., "Song Name - Artist")');
      return;
    }

    setResolving(true);
    setResolveError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch('/.netlify/functions/song-resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input: songQuery }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to resolve song');
      }

      if (json.track && json.track.spotify_url) {
        updateAsset('smartlink_url', json.track.spotify_url);
        setSongQuery('');
        alert(`Resolved: ${json.track.title} by ${json.track.artist}`);
      } else if (json.track && json.track.spotify_id) {
        const spotifyUrl = `https://open.spotify.com/track/${json.track.spotify_id}`;
        updateAsset('smartlink_url', spotifyUrl);
        setSongQuery('');
        alert(`Resolved: ${json.track.title} by ${json.track.artist}`);
      } else {
        throw new Error('No Spotify URL found');
      }
    } catch (err: any) {
      console.error('[AdsPlanFromGoals] Resolve error:', err);
      setResolveError(err.message || 'Failed to resolve song. Try pasting the URL manually.');
    } finally {
      setResolving(false);
    }
  }

  function addCreative(file: File, goalKey: OverallGoalKey) {
    const newCreative: Creative = {
      id: Math.random().toString(36),
      file,
      goalKey,
    };
    setCreatives(prev => [...prev, newCreative]);
  }

  function removeCreative(id: string) {
    setCreatives(prev => prev.filter(c => c.id !== id));
  }

  function getRequiredAssetKeys(goalKey: OverallGoalKey): Array<keyof PlanAssets> {
    const goal = GOAL_REGISTRY[goalKey];
    if (!goal) return [];

    const mapping: Record<string, Array<keyof PlanAssets>> = {
      smartlink_url: ['smartlink_url'],
      presave_url: ['presave_url'],
      lead_url: ['lead_url'],
      sound_urls: ['facebook_sound_url', 'tiktok_sound_url'],
      profile_urls: ['instagram_profile_url'],
      none: [],
    };

    const assetKeys: Array<keyof PlanAssets> = [];
    for (const reqAsset of goal.requiredAssets) {
      assetKeys.push(...(mapping[reqAsset] || []));
    }
    return assetKeys;
  }

  function areRequirementsMet(): boolean {
    for (const goalKey of activeGoals) {
      const required = getRequiredAssetKeys(goalKey);
      for (const key of required) {
        if (!planAssets[key]) {
          return false;
        }
      }
    }
    return true;
  }

  async function handleLaunch() {
    setLaunching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Create a draft for each active goal
      const primaryGoal = activeGoals[0];
      const goalBudget = goalSettings[primaryGoal]?.daily_budget || 10;

      // Get destination URL (prioritize smartlink)
      const destinationUrl = planAssets.smartlink_url || planAssets.presave_url || planAssets.lead_url || '';

      if (!destinationUrl) {
        throw new Error('Please add at least one destination link');
      }

      // Create campaign draft
      const { data: draft, error: draftError } = await supabase
        .from('campaign_drafts')
        .insert({
          user_id: user.id,
          goal: primaryGoal,
          budget_daily: goalBudget,
          duration_days: 7,
          destination_url: destinationUrl,
          status: 'draft',
        })
        .select()
        .single();

      if (draftError || !draft) {
        console.error('[AdsPlanFromGoals] Draft creation error:', draftError);
        throw new Error(draftError?.message || 'Failed to create campaign draft');
      }

      console.log('[AdsPlanFromGoals] Draft created:', draft.id);

      // Navigate to draft detail page
      navigate(`/studio/ads/drafts/${draft.id}`);
    } catch (err: any) {
      console.error('[AdsPlanFromGoals] Launch error:', err);
      alert(err.message || 'Failed to create campaign. Please try again.');
    } finally {
      setLaunching(false);
    }
  }

  const steps = [
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'requirements', label: 'Links', icon: Link },
    { id: 'creatives', label: 'Creatives', icon: Upload },
    { id: 'launch', label: 'Launch', icon: Rocket },
  ];

  const stepIndex = steps.findIndex(s => s.id === currentStep);

  if (loading) {
    return (
      <PageShell title="Use My Goals">
        <div className="flex items-center justify-center h-96">
          <div className="animate-pulse text-ghoste-grey">Loading your goals...</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Use My Goals" fullWidth>
      <div className="max-w-5xl mx-auto p-6">
        {/* Progress Stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === stepIndex;
              const isCompleted = idx < stepIndex;
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
                      isActive ? 'bg-ghoste-blue text-white' : isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-ghoste-grey',
                    ].join(' ')}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="flex-1 h-0.5 bg-white/10 mx-2"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Goals Summary */}
        {currentStep === 'goals' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ghoste-white mb-2">Your Active Goals</h2>
              <p className="text-ghoste-grey">These goals will be used to create your ad campaigns.</p>
            </div>

            <div className="space-y-3">
              {activeGoals.map(goalKey => {
                const goal = GOAL_REGISTRY[goalKey];
                return (
                  <div key={goalKey} className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-semibold text-ghoste-white">{goal.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Active</span>
                    </div>
                    <p className="text-sm text-ghoste-grey">{goal.description}</p>
                  </div>
                );
              })}
            </div>

            {activeGoals.length === 0 && (
              <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-yellow-300">No active goals. Please activate goals in your Profile first.</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setCurrentStep('requirements')}
                disabled={activeGoals.length === 0}
                className="px-6 py-3 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next: Add Links
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Requirements */}
        {currentStep === 'requirements' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ghoste-white mb-2">Add Required Links</h2>
              <p className="text-ghoste-grey">Enter the links Ghoste needs to run your campaigns.</p>
            </div>

            <div className="space-y-4">
              {activeGoals.map(goalKey => {
                const goal = GOAL_REGISTRY[goalKey];
                const required = getRequiredAssetKeys(goalKey);

                if (required.length === 0) {
                  return (
                    <div key={goalKey} className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="font-semibold text-ghoste-white">{goal.title}</span>
                      </div>
                      <p className="text-sm text-ghoste-grey">No setup needed</p>
                    </div>
                  );
                }

                return (
                  <div key={goalKey} className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                    <div className="mb-3">
                      <span className="font-semibold text-ghoste-white">{goal.title}</span>
                    </div>
                    <div className="space-y-3">
                      {required.map(assetKey => {
                        const labels: Record<keyof PlanAssets, string> = {
                          smartlink_url: 'Smart Link URL',
                          presave_url: 'Pre-Save Link URL',
                          lead_url: 'Lead Form URL',
                          facebook_sound_url: 'Facebook Sound URL',
                          tiktok_sound_url: 'TikTok Sound URL',
                          instagram_profile_url: 'Instagram Profile URL',
                          facebook_page_url: 'Facebook Page URL',
                          tiktok_profile_url: 'TikTok Profile URL',
                        };

                        return (
                          <div key={assetKey}>
                            <label className="block text-xs font-medium text-ghoste-grey mb-2">{labels[assetKey]}</label>

                            {/* Song Resolver for smartlink_url */}
                            {assetKey === 'smartlink_url' && (
                              <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                <p className="text-xs text-blue-300 mb-2">Find your song automatically</p>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={songQuery}
                                    onChange={(e) => setSongQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && resolveSongUrl()}
                                    placeholder="Song Name - Artist"
                                    className="flex-1 px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder-ghoste-grey/50 text-sm"
                                  />
                                  <button
                                    onClick={resolveSongUrl}
                                    disabled={resolving || !songQuery.trim()}
                                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap"
                                  >
                                    {resolving ? 'Finding...' : 'Find Song'}
                                  </button>
                                </div>
                                {resolveError && (
                                  <p className="text-xs text-red-400 mt-2">{resolveError}</p>
                                )}
                              </div>
                            )}

                            <input
                              type="url"
                              value={planAssets[assetKey] || ''}
                              onChange={(e) => updateAsset(assetKey, e.target.value)}
                              placeholder={assetKey === 'smartlink_url' ? 'Or paste Spotify URL manually' : `https://...`}
                              className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder-ghoste-grey/50"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('goals')}
                className="px-6 py-3 rounded-lg bg-white/5 text-ghoste-white font-medium hover:bg-white/10 transition-all"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep('creatives')}
                disabled={!areRequirementsMet()}
                className="px-6 py-3 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next: Upload Creatives
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Creatives */}
        {currentStep === 'creatives' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ghoste-white mb-2">Upload Creatives</h2>
              <p className="text-ghoste-grey">Add videos or images for your campaigns.</p>
            </div>

            <div className="p-6 rounded-lg bg-white/5 border-2 border-dashed border-ghoste-border text-center">
              <Upload className="w-12 h-12 text-ghoste-grey mx-auto mb-3" />
              <p className="text-ghoste-grey mb-4">Upload placeholder (full implementation pending)</p>
              <p className="text-xs text-ghoste-grey">Drag and drop videos/images or click to browse</p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('requirements')}
                className="px-6 py-3 rounded-lg bg-white/5 text-ghoste-white font-medium hover:bg-white/10 transition-all"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep('launch')}
                className="px-6 py-3 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 transition-all"
              >
                Next: Review & Launch
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Launch */}
        {currentStep === 'launch' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ghoste-white mb-2">Ready to Launch</h2>
              <p className="text-ghoste-grey">Review your setup and launch your campaigns.</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                <h3 className="font-semibold text-ghoste-white mb-2">Goals</h3>
                <div className="flex flex-wrap gap-2">
                  {activeGoals.map(goalKey => {
                    const goal = GOAL_REGISTRY[goalKey];
                    return (
                      <span key={goalKey} className="px-3 py-1 rounded-full text-sm bg-green-500/20 text-green-400">
                        {goal.title}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                <h3 className="font-semibold text-ghoste-white mb-2">Requirements</h3>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-ghoste-grey">All required links added</span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-ghoste-border">
                <h3 className="font-semibold text-ghoste-white mb-2">Creatives</h3>
                <div className="text-sm text-ghoste-grey">
                  {creatives.length} creative(s) uploaded
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('creatives')}
                className="px-6 py-3 rounded-lg bg-white/5 text-ghoste-white font-medium hover:bg-white/10 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="px-6 py-3 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {launching ? 'Launching...' : 'Launch Campaigns'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
