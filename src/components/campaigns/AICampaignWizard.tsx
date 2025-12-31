import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Target, DollarSign, Image as ImageIcon, Link as LinkIcon, Check, AlertCircle, Loader2, Sparkles, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { notify } from '../../lib/notify';
import { uploadCreative, getCreatives, deleteCreative } from '../../lib/uploadCreative';

type CampaignGoal = 'streams' | 'followers' | 'link_clicks' | 'leads';
type WizardStep = 'goal' | 'budget' | 'creative' | 'destination' | 'review';

interface CreativeAsset {
  id: string;
  url: string;
  type: 'image' | 'video';
  name?: string;
}

interface SmartLink {
  id: string;
  slug: string;
  title: string;
  destination_url?: string;
}

interface AICampaignWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AICampaignWizard({ onClose, onSuccess }: AICampaignWizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>('goal');

  // Form state
  const [goal, setGoal] = useState<CampaignGoal>('streams');
  const [dailyBudget, setDailyBudget] = useState<number>(10);
  const [duration, setDuration] = useState<number>(7);
  const [countries, setCountries] = useState<string[]>(['US']);
  const [selectedCreatives, setSelectedCreatives] = useState<CreativeAsset[]>([]);
  const [selectedSmartLink, setSelectedSmartLink] = useState<SmartLink | null>(null);

  // Data state
  const [smartLinks, setSmartLinks] = useState<SmartLink[]>([]);
  const [loadingSmartLinks, setLoadingSmartLinks] = useState(false);
  const [metaConnected, setMetaConnected] = useState<boolean>(false);
  const [metaAssetsConfigured, setMetaAssetsConfigured] = useState<boolean>(false);
  const [checkingMeta, setCheckingMeta] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingCreatives, setLoadingCreatives] = useState(false);

  const steps: { id: WizardStep; label: string; number: number }[] = [
    { id: 'goal', label: 'Goal', number: 1 },
    { id: 'budget', label: 'Budget', number: 2 },
    { id: 'creative', label: 'Creative', number: 3 },
    { id: 'destination', label: 'Destination', number: 4 },
    { id: 'review', label: 'Review', number: 5 },
  ];

  const stepOrder: WizardStep[] = ['goal', 'budget', 'creative', 'destination', 'review'];
  const currentStepIndex = stepOrder.indexOf(currentStep);

  // Create or load draft on wizard open
  useEffect(() => {
    (async () => {
      if (!user) return;

      try {
        // Try to find existing draft for this user (status = 'draft')
        const { data: existingDrafts } = await supabase
          .from('campaign_drafts')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingDrafts && existingDrafts.length > 0) {
          // Use existing draft
          setDraftId(existingDrafts[0].id);
          console.log('[AICampaignWizard] Using existing draft:', existingDrafts[0].id);
        } else {
          // Create new draft
          const { data: newDraft, error: draftError } = await supabase
            .from('campaign_drafts')
            .insert([
              {
                user_id: user.id,
                goal: 'song_promo',
                budget_daily: 10,
                duration_days: 7,
                status: 'draft',
              },
            ])
            .select()
            .single();

          if (draftError) {
            console.error('[AICampaignWizard] Failed to create draft:', draftError);
          } else {
            setDraftId(newDraft.id);
            console.log('[AICampaignWizard] Created new draft:', newDraft.id);
          }
        }
      } catch (err) {
        console.error('[AICampaignWizard] Draft setup error:', err);
      }
    })();
  }, [user]);

  // Check Meta connection status via canonical endpoint
  useEffect(() => {
    (async () => {
      if (!user) return;
      setCheckingMeta(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.warn('[AICampaignWizard] No session for Meta status check');
          setMetaConnected(false);
          setMetaAssetsConfigured(false);
          return;
        }

        const response = await fetch('/.netlify/functions/meta-status', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        const data = await response.json();

        setMetaConnected(data?.auth_connected === true);
        setMetaAssetsConfigured(data?.assets_configured === true);

        console.log('[AICampaignWizard] Meta status:', {
          auth_connected: data?.auth_connected,
          assets_configured: data?.assets_configured,
          ready_to_run_ads: data?.ready_to_run_ads,
          checkmarks: data?.checkmarks,
          source: data?.source,
        });
      } catch (err) {
        console.error('[AICampaignWizard] Failed to check Meta status:', err);
        setMetaConnected(false);
        setMetaAssetsConfigured(false);
      } finally {
        setCheckingMeta(false);
      }
    })();
  }, [user]);

  // Load creatives from DB when entering creative step
  useEffect(() => {
    if (currentStep === 'creative' && user && draftId) {
      loadCreativesFromDB();
    }
  }, [currentStep, user, draftId]);

  const loadCreativesFromDB = async () => {
    if (!user || !draftId) return;

    setLoadingCreatives(true);
    try {
      const result = await getCreatives(user.id, draftId);

      if (result.ok && result.creatives) {
        // Map DB creatives to CreativeAsset format
        const mapped: CreativeAsset[] = result.creatives.map((c) => ({
          id: c.id,
          url: c.public_url,
          type: c.creative_type,
          name: c.storage_path.split('/').pop() || 'creative',
        }));

        setSelectedCreatives(mapped);
        console.log('[AICampaignWizard] Loaded creatives from DB:', mapped.length);
      }
    } catch (err) {
      console.error('[AICampaignWizard] Failed to load creatives:', err);
    } finally {
      setLoadingCreatives(false);
    }
  };

  // Load smart links
  useEffect(() => {
    if (currentStep === 'destination' && user) {
      loadSmartLinks();
    }
  }, [currentStep, user]);

  const loadSmartLinks = async () => {
    setLoadingSmartLinks(true);
    try {
      const { data, error } = await supabase
        .from('smart_links')
        .select('id, slug, title, destination_url')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSmartLinks(data || []);
    } catch (err) {
      console.error('[AICampaignWizard] Failed to load smart links:', err);
      notify('error', 'Failed to load Smart Links');
    } finally {
      setLoadingSmartLinks(false);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentStepIndex + 1]);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(stepOrder[currentStepIndex - 1]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'goal': return true; // Always can proceed
      case 'budget': return dailyBudget > 0 && duration > 0;
      case 'creative': return selectedCreatives.length > 0;
      case 'destination': return selectedSmartLink !== null;
      case 'review': return true;
      default: return false;
    }
  };

  const handlePublish = async () => {
    setSubmitting(true);
    setValidationErrors([]);

    try {
      // Validate Meta connection
      if (!metaConnected) {
        setValidationErrors(['Meta account not connected. Go to Profile → Connected Accounts.']);
        return;
      }

      // Validate smart link
      if (!selectedSmartLink) {
        setValidationErrors(['Smart Link is required']);
        return;
      }

      // Validate creatives
      if (selectedCreatives.length === 0) {
        setValidationErrors(['At least one creative asset is required']);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Build payload for run-ads-submit endpoint
      // Map goal to ad_goal, convert budget to cents, and map fields correctly
      // Include draft_id so function can load creatives from DB
      const payload = {
        ad_goal: goal, // streams, followers, link_clicks, leads
        daily_budget_cents: Math.round(dailyBudget * 100), // Convert dollars to cents
        automation_mode: 'manual', // Default automation mode
        creative_ids: selectedCreatives.map(c => c.id),
        draft_id: draftId, // NEW: Allow function to load creatives from DB
        smart_link_id: selectedSmartLink.id,
        total_budget_cents: duration > 0 ? Math.round(dailyBudget * duration * 100) : null,
      };

      console.log('[AICampaignWizard] Publishing campaign:', {
        ad_goal: payload.ad_goal,
        daily_budget_cents: payload.daily_budget_cents,
        creative_count: payload.creative_ids.length,
        draft_id: payload.draft_id,
        smart_link_id: payload.smart_link_id,
      });

      // Call the correct endpoint for campaign creation
      const response = await fetch('/.netlify/functions/run-ads-submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[AICampaignWizard] Publish failed:', error);
        throw new Error(error.error || error.message || 'Failed to create campaign');
      }

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to create campaign');
      }

      // Success
      console.log('[AICampaignWizard] Campaign published successfully:', result.campaign_id);
      notify('success', `Campaign created successfully! ${result.campaign_type || ''}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[AICampaignWizard] Publish error:', err);
      notify('error', 'Failed to create campaign', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!user) {
      notify('error', 'Please sign in to upload creatives');
      return;
    }

    if (!draftId) {
      notify('error', 'Draft not ready. Please try again.');
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        console.log('[AICampaignWizard] Uploading creative:', {
          name: file.name,
          size: file.size,
          type: file.type,
        });

        const result = await uploadCreative(file, user.id, draftId);

        if (!result.ok) {
          console.error('[AICampaignWizard] Upload failed:', result.error, result.details);
          notify('error', `Failed to upload ${file.name}`, result.details);
          return null;
        }

        console.log('[AICampaignWizard] Upload successful:', result.creative?.id);
        return result.creative;
      });

      const uploadedCreatives = await Promise.all(uploadPromises);
      const successfulUploads = uploadedCreatives.filter((c) => c !== null);

      if (successfulUploads.length > 0) {
        notify('success', `Uploaded ${successfulUploads.length} creative(s)`);
        // Reload creatives from DB to get fresh state
        await loadCreativesFromDB();
      }
    } catch (err: any) {
      console.error('[AICampaignWizard] Upload error:', err);
      notify('error', 'Upload failed', err.message);
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDeleteCreative = async (creativeId: string) => {
    if (!user) return;

    try {
      const result = await deleteCreative(creativeId, user.id);

      if (result.ok) {
        notify('success', 'Creative deleted');
        // Remove from local state
        setSelectedCreatives(selectedCreatives.filter((c) => c.id !== creativeId));
      } else {
        notify('error', 'Failed to delete creative', result.error);
      }
    } catch (err: any) {
      console.error('[AICampaignWizard] Delete error:', err);
      notify('error', 'Delete failed', err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Guided AI Campaign Builder</h2>
              <p className="text-sm text-gray-400">Let AI handle the complexity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const isActive = step.id === currentStep;
              const isCompleted = stepOrder.indexOf(step.id) < currentStepIndex;

              return (
                <div key={step.id} className="flex-1 flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-blue-500 text-white'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-800 text-gray-500'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : step.number}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? 'text-white' : isCompleted ? 'text-green-400' : 'text-gray-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 ${
                        isCompleted ? 'bg-green-500' : 'bg-slate-800'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStep === 'goal' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">What's your goal?</h3>
                <p className="text-sm text-gray-400">Choose the primary objective for this campaign</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'streams' as CampaignGoal, icon: Play, label: 'Get Streams', desc: 'Drive plays on streaming platforms' },
                  { id: 'followers' as CampaignGoal, icon: Target, label: 'Grow Followers', desc: 'Increase social media following' },
                  { id: 'link_clicks' as CampaignGoal, icon: LinkIcon, label: 'Smart Link Clicks', desc: 'Drive traffic to your Smart Link' },
                  { id: 'leads' as CampaignGoal, icon: Target, label: 'Collect Emails', desc: 'Build your email list' },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setGoal(option.id)}
                    className={`p-6 rounded-xl border-2 transition-all text-left ${
                      goal === option.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <option.icon className={`w-8 h-8 mb-3 ${goal === option.id ? 'text-blue-400' : 'text-gray-400'}`} />
                    <h4 className="text-white font-semibold mb-1">{option.label}</h4>
                    <p className="text-sm text-gray-400">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'budget' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Budget & Timing</h3>
                <p className="text-sm text-gray-400">Set your daily budget and campaign duration</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Daily Budget (USD)
                  </label>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={dailyBudget}
                      onChange={(e) => setDailyBudget(Number(e.target.value))}
                      min="1"
                      className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Total budget: ${(dailyBudget * duration).toFixed(2)} over {duration} days
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Duration
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[7, 14, 30].map((days) => (
                      <button
                        key={days}
                        onClick={() => setDuration(days)}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          duration === days
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-slate-700 bg-slate-800/50 text-gray-400 hover:border-slate-600'
                        }`}
                      >
                        <span className="font-semibold">{days} days</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Target Countries
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['US', 'UK', 'CA', 'AU'].map((country) => (
                      <button
                        key={country}
                        onClick={() => {
                          if (countries.includes(country)) {
                            setCountries(countries.filter(c => c !== country));
                          } else {
                            setCountries([...countries, country]);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg border transition-all ${
                          countries.includes(country)
                            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-slate-700 bg-slate-800/50 text-gray-400 hover:border-slate-600'
                        }`}
                      >
                        {country}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'creative' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Upload Creatives</h3>
                <p className="text-sm text-gray-400">Add images or videos for your ads</p>
              </div>

              <div>
                <label className="block w-full cursor-pointer">
                  <div className={`border-2 border-dashed border-slate-700 rounded-xl p-12 text-center transition-colors ${
                    uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500'
                  }`}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
                        <p className="text-white font-medium mb-1">Uploading...</p>
                        <p className="text-sm text-gray-400">Please wait</p>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-white font-medium mb-1">Click to upload</p>
                        <p className="text-sm text-gray-400">Images and videos (all sizes supported)</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {loadingCreatives ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <p className="ml-3 text-gray-400">Loading creatives...</p>
                </div>
              ) : selectedCreatives.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {selectedCreatives.map((creative) => (
                    <div key={creative.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                        {creative.type === 'image' ? (
                          <img src={creative.url} alt={creative.name} className="w-full h-full object-cover" />
                        ) : (
                          <video src={creative.url} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteCreative(creative.id)}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete creative"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                      {creative.name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                          <p className="text-xs text-white truncate">{creative.name}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {currentStep === 'destination' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Choose Destination</h3>
                <p className="text-sm text-gray-400">Select the Smart Link this campaign will promote</p>
              </div>

              {loadingSmartLinks ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                </div>
              ) : smartLinks.length === 0 ? (
                <div className="text-center py-12">
                  <LinkIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">No Smart Links found</p>
                  <p className="text-sm text-gray-400 mb-4">Create a Smart Link first to promote it with ads</p>
                  <a
                    href="/studio/smart-links"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Smart Link
                  </a>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {smartLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => setSelectedSmartLink(link)}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                        selectedSmartLink?.id === link.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium">{link.title || link.slug}</h4>
                          <p className="text-sm text-gray-400 mt-1">ghoste.one/l/{link.slug}</p>
                        </div>
                        {selectedSmartLink?.id === link.id && (
                          <Check className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Review & Publish</h3>
                <p className="text-sm text-gray-400">Confirm your campaign details before publishing</p>
              </div>

              {/* Meta Connection Status */}
              <div className={`p-4 rounded-lg border ${
                metaConnected
                  ? 'border-green-500/30 bg-green-500/10'
                  : 'border-red-500/30 bg-red-500/10'
              }`}>
                <div className="flex items-center gap-3">
                  {metaConnected ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <div>
                    <p className={`font-medium ${metaConnected ? 'text-green-400' : 'text-red-400'}`}>
                      Meta {metaConnected ? 'Connected' : 'Not Connected'}
                    </p>
                    {!metaConnected && (
                      <p className="text-sm text-gray-400 mt-1">
                        <a href="/profile?tab=connected-accounts" className="underline">
                          Connect Meta in Profile
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Campaign Summary */}
              <div className="space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm font-medium text-gray-400 mb-1">Goal</p>
                  <p className="text-white font-semibold capitalize">{goal.replace('_', ' ')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-sm font-medium text-gray-400 mb-1">Daily Budget</p>
                    <p className="text-white font-semibold">${dailyBudget}</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <p className="text-sm font-medium text-gray-400 mb-1">Duration</p>
                    <p className="text-white font-semibold">{duration} days</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm font-medium text-gray-400 mb-1">Creatives</p>
                  <p className="text-white font-semibold">{selectedCreatives.length} asset(s)</p>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm font-medium text-gray-400 mb-1">Destination</p>
                  <p className="text-white font-semibold">{selectedSmartLink?.title || 'None selected'}</p>
                  {selectedSmartLink && (
                    <p className="text-sm text-gray-400 mt-1">ghoste.one/l/{selectedSmartLink.slug}</p>
                  )}
                </div>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-400 mb-2">Missing Requirements:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {validationErrors.map((error, idx) => (
                          <li key={idx} className="text-sm text-red-300">{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {currentStep === 'review' ? (
            <button
              onClick={handlePublish}
              disabled={submitting || !metaConnected}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Publish Campaign
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
