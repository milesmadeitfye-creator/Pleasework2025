import { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, Building, FileText, Instagram, TrendingUp, Check, Loader2, AlertCircle, Facebook, User, Sparkles, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMetaCredentials } from '../../hooks/useMetaCredentials';
import { metaGetSettings, metaSaveSettings } from '../../lib/metaSettingsApi';
import { notify } from '../../lib/notify';

type StepId = 'business' | 'profile' | 'page' | 'instagram' | 'adAccount' | 'tracking' | 'confirm';

type MetaConnectWizardProps = {
  onComplete?: (result: {
    business?: { id: string; name: string } | null;
    profile?: { id: string; name: string; pictureUrl?: string | null } | null;
    page?: { id: string; name: string } | null;
    instagram?: { id: string; username: string } | null;
    adAccount?: { id: string; name: string } | null;
  }) => void;
  onCancel?: () => void;
};

async function fetchMetaAssets<T>(
  type: 'businesses' | 'pages' | 'instagram_accounts' | 'ad_accounts' | 'pixels',
  params?: Record<string, string>
): Promise<T[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const res = await fetch('/.netlify/functions/meta-assets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ type, ...params }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[MetaConnectWizard] meta-assets error', res.status, text);
    throw new Error(text || `Failed to fetch ${type}`);
  }

  const json = await res.json();
  return json.items || [];
}

export function MetaConnectWizard({ onComplete }: MetaConnectWizardProps) {
  const { user } = useAuth();
  const { meta, isMetaConnected, loading: metaLoading } = useMetaCredentials(user?.id);
  const [currentStep, setCurrentStep] = useState<StepId>('business');

  // Build version check - log once on mount
  useEffect(() => {
    console.log('[MetaWizard] Component loaded - Build timestamp:', new Date().toISOString());
    console.log('[MetaWizard] Version: Fixed save crash with comprehensive logging');
  }, []);
  const [selectedBusiness, setSelectedBusiness] = useState<{ id: string; name: string } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<{ id: string; name: string; pictureUrl?: string | null } | null>(null);
  const [selectedPage, setSelectedPage] = useState<{ id: string; name: string } | null>(null);
  const [selectedInstagram, setSelectedInstagram] = useState<{ id: string; username: string } | null>(null);
  const [selectedAdAccount, setSelectedAdAccount] = useState<{ id: string; name: string } | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [conversionApiToken, setConversionApiToken] = useState('');
  const [capiEnabled, setCapiEnabled] = useState(false);
  const [pagePostingEnabled, setPagePostingEnabled] = useState(false);
  const [instagramPostingEnabled, setInstagramPostingEnabled] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);
  const [instagrams, setInstagrams] = useState<Array<{ id: string; username: string }>>([]);
  const [adAccounts, setAdAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [pixels, setPixels] = useState<Array<{ id: string; name: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Load businesses when Meta is connected
  useEffect(() => {
    if (!isMetaConnected || !user) return;

    (async () => {
      try {
        setLoadingBusinesses(true);
        setBusinessError(null);

        // Load saved configuration from meta_credentials (canonical source)
        const { data: assets } = await supabase
          .from('meta_credentials')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (assets) {
          if (assets.business_id && assets.business_name) {
            setSelectedBusiness({ id: assets.business_id, name: assets.business_name });
          }
          if (assets.meta_profile_id && assets.meta_profile_name) {
            setSelectedProfile({
              id: assets.meta_profile_id,
              name: assets.meta_profile_name,
              pictureUrl: assets.meta_profile_picture_url || null,
            });
          }
          if (assets.page_id && assets.page_name) {
            setSelectedPage({ id: assets.page_id, name: assets.page_name });
          }
          if (assets.instagram_id && assets.instagram_username) {
            setSelectedInstagram({ id: assets.instagram_id, username: assets.instagram_username });
          }
          if (assets.ad_account_id && assets.ad_account_name) {
            setSelectedAdAccount({ id: assets.ad_account_id, name: assets.ad_account_name });
          }
        }

        // Load pixel and CAPI settings from meta_credentials
        if (meta) {
          setPixelId(meta.pixel_id || '');
          setConversionApiToken(meta.conversion_api_token || '');
          setCapiEnabled(!!meta.capi_enabled);
          setPagePostingEnabled(!!meta.page_posting_enabled);
          setInstagramPostingEnabled(!!meta.instagram_posting_enabled);
        }

        // Load saved settings from meta-get-settings (overrides above if present)
        try {
          const savedSettings = await metaGetSettings(user.id);
          if (savedSettings.pixel_id) setPixelId(savedSettings.pixel_id);
          if (savedSettings.page_id) {
            const page = pages.find(p => p.id === savedSettings.page_id);
            if (page) setSelectedPage(page);
          }
          if (savedSettings.instagram_actor_id) {
            const ig = instagrams.find(i => i.id === savedSettings.instagram_actor_id);
            if (ig) setSelectedInstagram(ig);
          }
          if (savedSettings.use_page_for_posting !== undefined) {
            setPagePostingEnabled(!!savedSettings.use_page_for_posting);
          }
          if (savedSettings.use_instagram_for_posting !== undefined) {
            setInstagramPostingEnabled(!!savedSettings.use_instagram_for_posting);
          }
        } catch (err) {
          console.warn('[MetaConnectWizard] Failed to load saved settings:', err);
        }

        // Load businesses from new endpoint
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const res = await fetch('/.netlify/functions/meta-businesses', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          setBusinesses(data.businesses || []);

          // Handle empty businesses with helpful message
          if (data.reason) {
            if (data.reason === 'permission_denied') {
              console.log('[MetaConnectWizard] No Business Manager permission, continuing without business');
            } else if (data.reason === 'none') {
              console.log('[MetaConnectWizard] No businesses found, continuing without business');
            }
          }
        } else {
          const errorData = await res.json();
          if (errorData.error === 'no_meta_connection' || errorData.error === 'not_authenticated') {
            setBusinessError('Meta connection lost. Please reconnect in Connected Accounts.');
          } else {
            // Don't block wizard for other errors, just log
            console.warn('[MetaConnectWizard] Business fetch error:', errorData.error);
            setBusinesses([]);
          }
        }
      } catch (err: any) {
        console.error('[MetaConnectWizard] Load error:', err);
        setBusinessError(err.message || 'Failed to load businesses');
      } finally {
        setLoadingBusinesses(false);
      }
    })();
  }, [user, isMetaConnected]);

  // Load pages when business is selected
  useEffect(() => {
    if (!selectedBusiness) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedPages = await fetchMetaAssets<{ id: string; name: string }>('pages', {
          business_id: selectedBusiness.id,
        });
        setPages(fetchedPages);
      } catch (err: any) {
        console.error('[MetaConnectWizard] Pages error:', err);
        setError(err.message || 'Failed to load pages');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedBusiness]);

  // Load Instagram when page is selected
  useEffect(() => {
    if (!selectedPage) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedInstagrams = await fetchMetaAssets<{ id: string; username: string }>('instagram_accounts', {
          page_id: selectedPage.id,
        });
        setInstagrams(fetchedInstagrams);
      } catch (err: any) {
        console.error('[MetaConnectWizard] Instagram error:', err);
        setError(err.message || 'Failed to load Instagram accounts');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedPage]);

  // Load ad accounts when business is selected
  useEffect(() => {
    if (!selectedBusiness) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedAdAccounts = await fetchMetaAssets<{ id: string; name: string }>('ad_accounts', {
          business_id: selectedBusiness.id,
        });
        setAdAccounts(fetchedAdAccounts);
      } catch (err: any) {
        console.error('[MetaConnectWizard] Ad accounts error:', err);
        setError(err.message || 'Failed to load ad accounts');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedBusiness]);

  // Load pixels when ad account is selected
  useEffect(() => {
    if (!selectedAdAccount) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedPixels = await fetchMetaAssets<{ id: string; name: string }>('pixels', {
          ad_account_id: selectedAdAccount.id,
        });
        setPixels(fetchedPixels);
        console.log('[MetaConnectWizard] Loaded pixels:', fetchedPixels.length);
      } catch (err: any) {
        console.error('[MetaConnectWizard] Pixels error:', err);
        // Don't set error state - pixels are optional
        setPixels([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedAdAccount]);

  // Load personal profile when profile step becomes active
  useEffect(() => {
    if (currentStep !== 'profile' || selectedProfile) return;

    (async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const res = await fetch('/.netlify/functions/meta-personal-profile', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const errorData = await res.json();

          // Only show NO_META_CONNECTION for 401 auth errors
          if (res.status === 401 && (errorData.error === 'NOT_CONNECTED' || errorData.error === 'NEEDS_RECONNECT')) {
            throw new Error(errorData.message || 'Meta connection lost. Please reconnect in Connected Accounts.');
          }

          throw new Error(errorData.message || errorData.error || 'Failed to load personal profile');
        }

        const profile = await res.json();

        // Verify we have required profile data
        if (!profile.id || !profile.name) {
          throw new Error('Invalid profile data received');
        }

        setSelectedProfile({
          id: profile.id,
          name: profile.name,
          pictureUrl: profile.pictureUrl || null,
        });
      } catch (err: any) {
        console.error('[MetaConnectWizard] Profile error:', err);
        setProfileError(err.message || 'Failed to load personal profile');
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [currentStep, selectedProfile]);

  const steps: { id: StepId; label: string; number: number }[] = [
    { id: 'business', label: 'Business', number: 1 },
    { id: 'profile', label: 'Profile', number: 2 },
    { id: 'page', label: 'Page', number: 3 },
    { id: 'instagram', label: 'Instagram', number: 4 },
    { id: 'adAccount', label: 'Ad Account', number: 5 },
    { id: 'tracking', label: 'Tracking', number: 6 },
    { id: 'confirm', label: 'Confirm', number: 7 },
  ];

  const stepOrder: StepId[] = ['business', 'profile', 'page', 'instagram', 'adAccount', 'tracking', 'confirm'];
  const currentStepIndex = stepOrder.indexOf(currentStep);

  const isStepComplete = (stepId: StepId) => {
    switch (stepId) {
      case 'business':
        // Business is optional - user can proceed with or without selecting one
        // Allow proceeding if: business selected OR no businesses available OR loading finished
        return !!selectedBusiness || businesses.length === 0 || !loadingBusinesses;
      case 'profile': return !!selectedProfile;
      case 'page': return !!selectedPage;
      case 'instagram': return !!selectedInstagram;
      case 'adAccount': return !!selectedAdAccount;
      case 'tracking': return !!(pixelId || (capiEnabled && conversionApiToken));
      case 'confirm': return completed;
      default: return false;
    }
  };

  const canProceed = () => {
    return isStepComplete(currentStep);
  };

  const handleNext = async () => {
    if (!user) return;

    try {
      // Save settings based on current step
      if (currentStep === 'tracking') {
        // Validate CAPI settings before saving
        if (capiEnabled && !conversionApiToken.trim()) {
          setTrackingError('Conversions API Token is required when CAPI is enabled');
          return;
        }

        setTrackingError(null);

        // Save pixel configuration
        await metaSaveSettings(user.id, { pixelId: pixelId || null });

        // Also save to old endpoint for backward compatibility
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const configRes = await fetch('/.netlify/functions/meta-save-config', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              pixelId: pixelId || null,
              conversionApiToken: conversionApiToken.trim() || null,
              capiEnabled,
              pixelVerified: !!(pixelId || conversionApiToken),
            }),
          });

          if (!configRes.ok) {
            const configError = await configRes.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[MetaConnectWizard] Failed to save tracking config:', configError);
            setError('Failed to save tracking configuration');
            notify('error', 'Failed to save tracking configuration');
            return;
          }

          console.log('[MetaConnectWizard] Tracking config saved successfully');
        }
      } else if (currentStep === 'page') {
        // Save page and posting preference
        await metaSaveSettings(user.id, {
          pageId: selectedPage?.id || null,
          usePageForPosting: pagePostingEnabled,
        });
      } else if (currentStep === 'instagram') {
        // Save instagram and posting preference
        await metaSaveSettings(user.id, {
          instagramActorId: selectedInstagram?.id || null,
          useInstagramForPosting: instagramPostingEnabled,
        });
      }
    } catch (err: any) {
      console.error('[MetaConnectWizard] Error saving settings:', err);
      setError('Failed to save settings');
      return;
    }

    if (currentStepIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentStepIndex + 1]);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(stepOrder[currentStepIndex - 1]);
    }
  };

  const handleSave = async () => {
    if (!user) {
      setError('Not authenticated');
      notify('error', 'Not authenticated');
      return;
    }

    // Validate CAPI settings before final save
    const safeConversionToken = (conversionApiToken || '').trim();
    if (capiEnabled && !safeConversionToken) {
      setError('Conversions API Token is required when CAPI is enabled');
      notify('error', 'Conversions API Token is required when CAPI is enabled');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Find pixel object from pixels array (optional)
      const selectedPixel = pixelId ? pixels.find(p => p.id === pixelId) : null;

      // Debug logging before save (no sensitive tokens)
      console.log('[MetaWizard] ===== STARTING SAVE CONFIGURATION =====');
      console.log('[MetaWizard] Selected assets:', {
        business: selectedBusiness ? { id: selectedBusiness.id, name: selectedBusiness.name } : null,
        profile: selectedProfile ? { id: selectedProfile.id, name: selectedProfile.name } : null,
        page: selectedPage ? { id: selectedPage.id, name: selectedPage.name } : null,
        instagram: selectedInstagram ? { id: selectedInstagram.id, username: selectedInstagram.username } : null,
        adAccount: selectedAdAccount ? { id: selectedAdAccount.id, name: selectedAdAccount.name } : null,
        pixel: pixelId ? { id: pixelId, name: selectedPixel?.name ?? 'Unknown' } : null,
      });
      console.log('[MetaWizard] CAPI settings:', {
        capiEnabled,
        hasToken: !!safeConversionToken,
        pagePostingEnabled,
        instagramPostingEnabled,
      });

      // Save to meta_credentials (canonical source) - this is the PRIMARY save
      console.log('[MetaWizard] Step 1 (PRIMARY): Saving to meta_credentials table...');
      const primaryPayload = {
        user_id: user.id,
        business_id: selectedBusiness?.id ?? null,
        business_name: selectedBusiness?.name ?? null,
        meta_profile_id: selectedProfile?.id ?? null,
        meta_profile_name: selectedProfile?.name ?? null,
        meta_profile_picture_url: selectedProfile?.pictureUrl ?? null,
        page_id: selectedPage?.id ?? null,
        page_name: selectedPage?.name ?? null,
        facebook_page_id: selectedPage?.id ?? null, // Dual write
        facebook_page_name: selectedPage?.name ?? null,
        instagram_id: selectedInstagram?.id ?? null,
        instagram_username: selectedInstagram?.username ?? null,
        ad_account_id: selectedAdAccount?.id ?? null,
        ad_account_name: selectedAdAccount?.name ?? null,
        pixel_id: pixelId || null,
        pixel_name: selectedPixel?.name ?? null,
        configuration_complete: true,
        setup_completed_at: new Date().toISOString(),
      };

      console.log('[MetaWizard] Primary payload preview:', {
        user_id: primaryPayload.user_id,
        business_id: primaryPayload.business_id,
        ad_account_id: primaryPayload.ad_account_id,
        page_id: primaryPayload.page_id,
        instagram_id: primaryPayload.instagram_id,
        pixel_id: primaryPayload.pixel_id,
      });

      const { error: saveError } = await supabase
        .from('meta_credentials')
        .upsert(primaryPayload, {
          onConflict: 'user_id',
        });

      if (saveError) {
        console.error('[MetaWizard] Step 1 (PRIMARY) FAILED:', saveError);
        console.error('[MetaWizard] Error code:', saveError.code);
        console.error('[MetaWizard] Error details:', saveError.details);
        console.error('[MetaWizard] Error hint:', saveError.hint);
        throw new Error(`Failed to save meta_credentials: ${saveError.message}`);
      }
      console.log('[MetaWizard] Step 1 (PRIMARY) SUCCESS: meta_credentials saved ✓');

      // Also update connected_accounts table with counts (NON-FATAL - supplementary data)
      console.log('[MetaWizard] Step 2 (SUPPLEMENTARY): Updating connected_accounts...');
      try {
        const adAccountCount = selectedAdAccount ? 1 : 0;
        const facebookPageCount = selectedPage ? 1 : 0;
        const instagramAccountCount = selectedInstagram ? 1 : 0;

        const { error: connectedError } = await supabase
          .from('connected_accounts')
          .upsert({
            user_id: user.id,
            provider: 'meta',
            status: 'connected',
            last_connected_at: new Date().toISOString(),
            data: {
              ad_account_count: adAccountCount,
              facebook_page_count: facebookPageCount,
              instagram_account_count: instagramAccountCount,
              meta_profile_id: selectedProfile?.id,
              meta_profile_name: selectedProfile?.name,
            },
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,provider',
          });

        if (connectedError) {
          console.warn('[MetaWizard] Step 2 WARNING (non-fatal):', connectedError);
        } else {
          console.log('[MetaWizard] Step 2 SUCCESS: connected_accounts updated ✓');
        }
      } catch (step2Error: any) {
        console.warn('[MetaWizard] Step 2 caught exception (non-fatal):', step2Error.message);
      }

      // Save pixel, CAPI, and posting configuration (NON-FATAL - extended config)
      console.log('[MetaWizard] Step 3 (SUPPLEMENTARY): Calling meta-save-config endpoint...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const pixelVerified = !!(pixelId || safeConversionToken || capiEnabled);

          const configPayload = {
            pixelId: pixelId || null,
            conversionApiToken: safeConversionToken || null,
            pixelVerified,
            capiEnabled,
            default_page_id: selectedPage?.id || null,
            default_instagram_id: selectedInstagram?.id || null,
            page_posting_enabled: pagePostingEnabled,
            instagram_posting_enabled: instagramPostingEnabled,
            configurationComplete: true,
          };

          console.log('[MetaWizard] Payload (no tokens):', {
            ...configPayload,
            conversionApiToken: safeConversionToken ? '[REDACTED]' : null,
          });

          const configRes = await fetch('/.netlify/functions/meta-save-config', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(configPayload),
          });

          console.log('[MetaWizard] meta-save-config response:', configRes.status, configRes.statusText);

          if (!configRes.ok) {
            const configError = await configRes.json().catch(() => ({ error: 'Failed to parse error response' }));
            console.warn('[MetaWizard] Step 3 WARNING (non-fatal):', {
              status: configRes.status,
              statusText: configRes.statusText,
              error: configError,
            });
            // Don't throw - primary save already succeeded
          } else {
            const configResult = await configRes.json().catch(() => ({}));
            console.log('[MetaWizard] Step 3 SUCCESS: Extended config saved ✓', configResult);
          }
        } else {
          console.warn('[MetaWizard] Step 3 SKIPPED: No session available');
        }
      } catch (step3Error: any) {
        console.warn('[MetaWizard] Step 3 caught exception (non-fatal):', step3Error.message);
      }

      console.log('[MetaWizard] ===== SAVE CONFIGURATION COMPLETE =====');
      setCompleted(true);
      notify('success', 'Meta configuration saved successfully!');

      onComplete?.({
        business: selectedBusiness,
        profile: selectedProfile,
        page: selectedPage,
        instagram: selectedInstagram,
        adAccount: selectedAdAccount,
      });
    } catch (err: any) {
      console.error('[MetaWizard] ===== SAVE FAILED =====');
      console.error('[MetaWizard] Error details:', {
        message: err.message,
        stack: err.stack,
        error: err,
      });

      const errorMessage = err.message || 'Failed to save configuration. Please try again.';
      setError(errorMessage);
      notify('error', 'Save Failed', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white mb-2">Meta Account Setup</h3>
        <p className="text-sm text-gray-400">
          Configure your Meta business assets for ads, posting, and analytics
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between relative">
        {steps.map((step, idx) => {
          const isCurrentStep = step.id === currentStep;
          const isPastStep = stepOrder.indexOf(step.id) < currentStepIndex;
          const isComplete = isStepComplete(step.id);

          return (
            <div key={step.id} className="flex-1 flex flex-col items-center relative">
              {/* Step Circle */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all z-10
                  ${isCurrentStep
                    ? 'bg-blue-500 text-white ring-4 ring-blue-500/20'
                    : isPastStep || isComplete
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-800 text-slate-400'
                  }
                `}
              >
                {isPastStep || isComplete ? <Check className="w-5 h-5" /> : step.number}
              </div>

              {/* Step Label */}
              <div className={`mt-2 text-xs font-medium text-center ${
                isCurrentStep ? 'text-blue-400' : isPastStep || isComplete ? 'text-green-400' : 'text-slate-500'
              }`}>
                {step.label}
              </div>

              {/* Connector Line */}
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-5 left-[60%] w-full h-0.5 -z-0 transition-colors ${
                    stepOrder.indexOf(step.id) < currentStepIndex ? 'bg-green-500' : 'bg-slate-800'
                  }`}
                  style={{ width: 'calc(100% - 20px)' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800 min-h-[300px]">
        {currentStep === 'business' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Building className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Select Business</h4>
                <p className="text-sm text-gray-400">Choose the Meta Business Manager account</p>
              </div>
            </div>

            {/* Loading connection status */}
            {metaLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="ml-2 text-sm text-gray-400">Checking Meta connection...</span>
              </div>
            ) : !isMetaConnected ? (
              <div className="text-center py-8">
                <div className="mb-4">
                  <Facebook className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                  <p className="text-white font-medium mb-2">Meta Account Required</p>
                  <p className="text-sm text-gray-400 mb-6">
                    To access your Business Manager accounts, connect your Meta account in Profile settings.
                  </p>
                </div>
                <a
                  href="/profile?tab=connected-accounts"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Facebook className="w-5 h-5" />
                  Go to Connected Accounts
                </a>
              </div>
            ) : loadingBusinesses ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="ml-2 text-sm text-gray-400">Loading businesses...</span>
              </div>
            ) : businessError ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
                <p className="text-sm text-yellow-400 mb-4">{businessError}</p>
                <a
                  href="/profile?tab=connected-accounts"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm"
                >
                  Go to Connected Accounts
                </a>
              </div>
            ) : businesses.length === 0 ? (
              <div className="text-center py-8">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 mb-4">
                  <Info className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                  <p className="text-white font-medium mb-2">No Business Manager Found</p>
                  <p className="text-sm text-gray-400 mb-3">
                    You can continue without selecting a business. Business Manager is only needed for advanced ad features.
                  </p>
                  <p className="text-xs text-gray-500">
                    If you need Business Manager access, you can create one on Facebook and reconnect later.
                  </p>
                </div>
                <button
                  onClick={() => handleNext()}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue Without Business
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {businesses.map((biz) => (
                <button
                  key={biz.id}
                  onClick={() => setSelectedBusiness(biz)}
                  className={`
                    text-left p-4 rounded-lg border-2 transition-all
                    ${selectedBusiness?.id === biz.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{biz.name}</p>
                      <p className="text-xs text-gray-500 mt-1">ID: {biz.id}</p>
                    </div>
                    {selectedBusiness?.id === biz.id && (
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
              )}
          </div>
        )}

        {currentStep === 'profile' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Personal Profile</h4>
                <p className="text-sm text-gray-400">Your connected Facebook profile</p>
              </div>
            </div>

            {loadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="ml-2 text-sm text-gray-400">Loading profile...</span>
              </div>
            ) : profileError ? (
              <div className="text-center py-8">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <p className="text-sm text-red-400 mb-4">{profileError}</p>
                <button
                  onClick={() => {
                    setSelectedProfile(null);
                    setProfileError(null);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Retry
                </button>
              </div>
            ) : selectedProfile ? (
              <div className="max-w-md mx-auto">
                <div className="p-6 bg-slate-800/90 rounded-lg border-2 border-green-500">
                  <div className="flex items-center gap-4">
                    {selectedProfile.pictureUrl ? (
                      <img
                        src={selectedProfile.pictureUrl}
                        alt={selectedProfile.name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
                        <User className="w-8 h-8 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-white text-lg">{selectedProfile.name}</p>
                      <p className="text-xs text-gray-400 mt-1">Personal Facebook Profile</p>
                    </div>
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <p className="text-xs text-gray-400">
                      This is the personal Facebook profile connected to Ghoste One.
                      It will be used for managing your Meta business assets.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No profile data available.</p>
              </div>
            )}
          </div>
        )}

        {currentStep === 'page' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Select Facebook Page</h4>
                <p className="text-sm text-gray-400">Choose your main Facebook page for posting</p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : pages.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No pages found for this business.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => setSelectedPage(page)}
                    className={`
                      text-left p-4 rounded-lg border-2 transition-all
                      ${selectedPage?.id === page.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{page.name}</p>
                        <p className="text-xs text-gray-500 mt-1">ID: {page.id}</p>
                      </div>
                      {selectedPage?.id === page.id && (
                        <CheckCircle className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {selectedPage && (
                <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3">
                    <input
                      id="pagePosting"
                      type="checkbox"
                      checked={pagePostingEnabled}
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        setPagePostingEnabled(newValue);
                        if (user) {
                          try {
                            await metaSaveSettings(user.id, { usePageForPosting: newValue });
                          } catch (err) {
                            console.error('[MetaConnectWizard] Failed to save page posting toggle:', err);
                          }
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                    <label htmlFor="pagePosting" className="text-sm text-white cursor-pointer flex-1">
                      Use this Page for Ghoste auto-posting
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 ml-7">
                    Enable this to allow automatic posting to Facebook from Music Visuals and Social Media scheduler
                  </p>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {currentStep === 'instagram' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Instagram className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Select Instagram Account</h4>
                <p className="text-sm text-gray-400">Choose your Instagram business profile</p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : instagrams.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No Instagram accounts found for this page.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {instagrams.map((ig) => (
                  <button
                    key={ig.id}
                    onClick={() => setSelectedInstagram(ig)}
                    className={`
                      text-left p-4 rounded-lg border-2 transition-all
                      ${selectedInstagram?.id === ig.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{ig.username}</p>
                        <p className="text-xs text-gray-500 mt-1">ID: {ig.id}</p>
                      </div>
                      {selectedInstagram?.id === ig.id && (
                        <CheckCircle className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {selectedInstagram && (
                <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3">
                    <input
                      id="instagramPosting"
                      type="checkbox"
                      checked={instagramPostingEnabled}
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        setInstagramPostingEnabled(newValue);
                        if (user) {
                          try {
                            await metaSaveSettings(user.id, { useInstagramForPosting: newValue });
                          } catch (err) {
                            console.error('[MetaConnectWizard] Failed to save instagram posting toggle:', err);
                          }
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                    <label htmlFor="instagramPosting" className="text-sm text-white cursor-pointer flex-1">
                      Use this Instagram account for Ghoste auto-posting
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 ml-7">
                    Enable this to allow automatic posting to Instagram from Music Visuals and Social Media scheduler
                  </p>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {currentStep === 'adAccount' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Select Ad Account</h4>
                <p className="text-sm text-gray-400">Choose your Meta Ads account for campaigns</p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : adAccounts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No ad accounts found for this business.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {adAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAdAccount(acc)}
                  className={`
                    text-left p-4 rounded-lg border-2 transition-all
                    ${selectedAdAccount?.id === acc.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{acc.name}</p>
                      <p className="text-xs text-gray-500 mt-1">ID: {acc.id}</p>
                    </div>
                    {selectedAdAccount?.id === acc.id && (
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
              )}
          </div>
        )}

        {currentStep === 'tracking' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-blue-400" />
              <div>
                <h4 className="text-lg font-semibold text-white">Tracking & Conversions</h4>
                <p className="text-sm text-gray-400">Configure pixel and Conversions API for accurate tracking</p>
                <p className="text-xs text-blue-300 mt-1">
                  <Info className="w-3 h-3 inline mr-1" />
                  Pixel optional — you can add later
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Meta Pixel
                </label>
                {loading ? (
                  <div className="flex items-center gap-2 p-4 bg-slate-800 rounded-lg border border-slate-700">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-sm text-gray-400">Loading pixels...</span>
                  </div>
                ) : pixels.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {pixels.map((pixel) => (
                        <button
                          key={pixel.id}
                          onClick={() => setPixelId(pixel.id)}
                          className={`
                            w-full p-4 rounded-lg border-2 transition-all text-left
                            ${
                              pixelId === pixel.id
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-white">{pixel.name}</p>
                              <p className="text-xs text-gray-500 mt-1">ID: {pixel.id}</p>
                            </div>
                            {pixelId === pixel.id && (
                              <CheckCircle className="w-5 h-5 text-blue-400" />
                            )}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => setPixelId('')}
                        className={`
                          w-full p-4 rounded-lg border-2 transition-all text-left
                          ${
                            pixelId === ''
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-gray-400 text-sm">No pixel (skip)</p>
                          {pixelId === '' && (
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Pixels are loaded from your connected ad account ({selectedAdAccount?.name})
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={pixelId}
                      onChange={(e) => setPixelId(e.target.value)}
                      placeholder="e.g. 123456789012345"
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-2 text-xs text-gray-400">
                      No pixels found for this ad account. Enter a Pixel ID manually or find it in Meta Events Manager.
                    </p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Conversions API Token
                </label>
                <input
                  type="password"
                  value={conversionApiToken}
                  onChange={(e) => {
                    setConversionApiToken(e.target.value);
                    if (e.target.value.trim()) {
                      setTrackingError(null);
                    }
                  }}
                  placeholder="Enter your CAPI access token"
                  className={`w-full rounded-lg bg-slate-800 border px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 ${
                    trackingError ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-blue-500'
                  }`}
                />
                {trackingError && (
                  <p className="mt-2 text-xs text-red-400">{trackingError}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  Generate this token in Meta Events Manager under Conversions API settings
                </p>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <input
                  id="capiEnabled"
                  type="checkbox"
                  checked={capiEnabled}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    if (newValue && !conversionApiToken.trim()) {
                      setTrackingError('Conversions API Token is required to enable CAPI');
                      setCapiEnabled(false);
                      return;
                    }
                    setTrackingError(null);
                    setCapiEnabled(newValue);
                  }}
                  className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <label htmlFor="capiEnabled" className="text-sm text-white cursor-pointer flex-1">
                  Enable Conversions API (server-side tracking)
                </label>
              </div>

              {!pixelId && !conversionApiToken && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-300">
                    At least one tracking method is recommended. You can add these later in your profile settings.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 'confirm' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Review Your Configuration</h4>
              <p className="text-sm text-gray-400 mb-6">
                Please confirm your Meta account setup. You can change these later.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <Building className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Business</p>
                </div>
                <p className="text-white font-medium ml-8">{selectedBusiness?.name}</p>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <User className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Personal Profile</p>
                </div>
                <div className="ml-8 flex items-center gap-3">
                  {selectedProfile?.pictureUrl && (
                    <img
                      src={selectedProfile.pictureUrl}
                      alt={selectedProfile.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                  <p className="text-white font-medium">{selectedProfile?.name}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Facebook Page</p>
                </div>
                <p className="text-white font-medium ml-8">{selectedPage?.name}</p>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <Instagram className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Instagram Account</p>
                </div>
                <p className="text-white font-medium ml-8">{selectedInstagram?.username}</p>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Ad Account</p>
                </div>
                <p className="text-white font-medium ml-8">{selectedAdAccount?.name}</p>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Tracking & Conversions</p>
                </div>
                <div className="ml-8 space-y-1 text-sm text-white">
                  {pixelId ? (
                    <p>Pixel ID: {pixelId}</p>
                  ) : (
                    <p className="text-gray-500">No pixel configured</p>
                  )}
                  {capiEnabled && conversionApiToken ? (
                    <p className="text-green-400">Conversions API enabled</p>
                  ) : (
                    <p className="text-gray-500">Conversions API not configured</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-800/90 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <p className="text-sm font-medium text-gray-400">Auto-Posting</p>
                </div>
                <div className="ml-8 space-y-1 text-sm text-white">
                  {pagePostingEnabled ? (
                    <p className="text-green-400">Facebook Page posting enabled</p>
                  ) : (
                    <p className="text-gray-500">Facebook posting not enabled</p>
                  )}
                  {instagramPostingEnabled ? (
                    <p className="text-green-400">Instagram posting enabled</p>
                  ) : (
                    <p className="text-gray-500">Instagram posting not enabled</p>
                  )}
                </div>
              </div>
            </div>

            {/* Info note about recommended next steps */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200">
                  <p className="font-medium mb-1">Your Meta account is configured and ready!</p>
                  <p className="text-blue-300/80">
                    For Meta Business verification, we recommend creating at least one campaign and generating some API activity.
                    These are optional milestones and won't block your ability to use the Ads Manager.
                  </p>
                </div>
              </div>
            </div>

            {completed && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-3 text-green-400">
                  <CheckCircle className="w-5 h-5" />
                  <p className="text-sm font-medium">
                    Configuration saved successfully! Your Meta account is ready for campaigns.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800">
        <button
          onClick={handleBack}
          disabled={currentStepIndex === 0}
          className="px-6 py-2 text-sm font-medium text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>

        {currentStep === 'confirm' ? (
          <button
            onClick={handleSave}
            disabled={completed || saving}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : completed ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                Save Configuration
                <Check className="w-4 h-4" />
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
  );
}
