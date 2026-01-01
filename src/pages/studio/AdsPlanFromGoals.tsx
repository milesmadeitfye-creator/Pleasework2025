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
      alert('Launch flow not yet implemented. Campaign drafts will be created here.');
      navigate('/studio/ads');
    } catch (err) {
      console.error('Error launching campaigns:', err);
      alert('Failed to launch campaigns');
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
                            <input
                              type="url"
                              value={planAssets[assetKey] || ''}
                              onChange={(e) => updateAsset(assetKey, e.target.value)}
                              placeholder={`https://...`}
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
