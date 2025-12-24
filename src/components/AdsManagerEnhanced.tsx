import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, TrendingUp, DollarSign, Eye, MousePointer, X, Sparkles, Loader2, Edit, Copy, Save, RotateCw } from 'lucide-react';
import { useToast } from './Toast';
import { StyledSelect } from './StyledSelect';
import { CountryMultiSelect } from './CountryMultiSelect';
import { CreativeUploadSlot, type CreativeSlot } from './CreativeUploadSlot';
import {
  PLACEMENT_OPTIONS,
  PLACEMENT_GROUPS,
  type PlacementPlatform,
  type PlacementGroup,
} from '../lib/adPlacementConstants';
import { ProGate } from './ProGate';
import { useSpendCredits } from '../features/wallet/useSpendCredits';
import { CreditCostBadge } from '../features/wallet/CreditCostBadge';
import { safeToFixed, safeNumber } from '../utils/numbers';
import { MetaConnectBanner } from './meta/MetaConnectBanner';
import MetaEventLogsPanel from './meta/MetaEventLogsPanel';

interface Campaign {
  id: string;
  campaign_id?: string;
  name: string;
  platform?: string;
  status: string;
  effective_status?: string | null;
  daily_budget: number;
  budget?: number; // Legacy field for backward compatibility
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  smart_link_id?: string;
  objective?: string;
  ad_account_id?: string;
}

interface SmartLink {
  id: string;
  title: string;
  slug: string;
}


interface MetaAsset {
  id: string;
  name: string;
  currency?: string;
  status?: string;
}

interface MetaPage {
  id: string;
  name: string;
  instagram_business_account_id?: string;
  instagram_username?: string;
}

interface MetaInstagram {
  id: string;
  username: string;
  profile_picture_url?: string;
  linked_page_id?: string;
}

interface MetaPixel {
  id: string;
  name: string;
}

interface CustomConversion {
  id: string;
  name: string;
  event_type?: string;
  rule?: any;
  event_name?: string;
}

interface ConversionOption {
  type: 'pixel_event' | 'custom_conversion' | 'standard_event' | 'recommended';
  id?: string;
  name: string;
  value: string; // For backward compatibility
}

interface ConversionOptionsData {
  standardEvents: string[];
  customEventNames: string[];
  customConversions: Array<{ id: string; name: string; event_name?: string }>;
  recommended: string[];
  debug?: any;
}

const CONVERSION_EVENTS = [
  { label: 'View Content', value: 'VIEW_CONTENT' },
  { label: 'Search', value: 'SEARCH' },
  { label: 'Add to Cart', value: 'ADD_TO_CART' },
  { label: 'Add to Wishlist', value: 'ADD_TO_WISHLIST' },
  { label: 'Initiated Checkout', value: 'INITIATED_CHECKOUT' },
  { label: 'Add Payment Info', value: 'ADD_PAYMENT_INFO' },
  { label: 'Purchase', value: 'PURCHASE' },
  { label: 'Lead', value: 'LEAD' },
  { label: 'Complete Registration', value: 'COMPLETE_REGISTRATION' },
] as const;

const GENRE_OPTIONS = [
  'Hip-Hop / Rap',
  'R&B',
  'Pop',
  'Alternative',
  'Indie',
  'Afrobeats',
  'Reggaeton / Latin',
  'Country',
  'EDM / Dance',
  'House',
  'Techno',
  'Trap',
  'Drill',
  'Gospel / Christian',
  'Jazz',
  'Soul',
  'Metal',
  'Punk',
  'Singer-Songwriter',
  'Lo-fi',
  'K-Pop',
  'Amapiano',
  'Afro House',
  'Drum & Bass',
];

type CampaignStatus = string;

/**
 * Get normalized campaign status from raw status and effective_status
 */
function getCampaignStatus(rawStatus?: string | null, rawEffectiveStatus?: string | null): CampaignStatus {
  return ((rawStatus || rawEffectiveStatus || '').toUpperCase());
}

/**
 * Get human-readable status label
 */
function getStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case 'ACTIVE': return 'Active';
    case 'PAUSED': return 'Paused';
    case 'DRAFT': return 'Draft';
    case 'IN_REVIEW':
    case 'PENDING_REVIEW': return 'In Review';
    case 'PROCESSING':
    case 'PREPARING': return 'Processing';
    case 'SCHEDULED': return 'Scheduled';
    case 'DISAPPROVED':
    case 'REJECTED': return 'Rejected';
    case 'ARCHIVED': return 'Archived';
    case 'OFF': return 'Off';
    default: return status || 'Unknown';
  }
}

/**
 * Determine if toggle should be ON (blue)
 * Toggle is ON for all statuses EXCEPT truly off states
 */
function isConsideredOn(status: CampaignStatus): boolean {
  const s = status.toUpperCase();
  const isOff = (
    s === 'PAUSED' ||
    s === 'OFF' ||
    s === 'ARCHIVED' ||
    s === 'DISAPPROVED' ||
    s === 'REJECTED' ||
    s === 'DRAFT'
  );
  return !isOff;
}

/**
 * Get status badge color
 */
function getStatusColor(status: CampaignStatus): string {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-400';
    case 'PAUSED':
    case 'OFF':
    case 'ARCHIVED': return 'bg-slate-400';
    case 'DRAFT': return 'bg-blue-400';
    case 'IN_REVIEW':
    case 'PENDING_REVIEW':
    case 'PROCESSING':
    case 'PREPARING':
    case 'SCHEDULED': return 'bg-amber-400';
    case 'DISAPPROVED':
    case 'REJECTED': return 'bg-red-400';
    default: return 'bg-slate-400';
  }
}

export default function AdsManagerEnhanced() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { spendForFeature, isSpending } = useSpendCredits();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [smartLinks, setSmartLinks] = useState<SmartLink[]>([]);
  const [, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMetaAssets, setLoadingMetaAssets] = useState(false);
  const [metaAccounts, setMetaAccounts] = useState<MetaAsset[]>([]);
  const [metaPages, setMetaPages] = useState<MetaPage[]>([]);
  const [metaInstagramAccounts, setMetaInstagramAccounts] = useState<MetaInstagram[]>([]);
  const [metaPixels, setMetaPixels] = useState<MetaPixel[]>([]);
  const [pixelDebugInfo, setPixelDebugInfo] = useState<any>(null);
  const [customConversions, setCustomConversions] = useState<CustomConversion[]>([]);
  const [hasInstagramActorId, setHasInstagramActorId] = useState<boolean>(true); // Track if IG actor ID exists
  const [conversionOptions, setConversionOptions] = useState<ConversionOptionsData | null>(null);
  const [loadingConversionOptions, setLoadingConversionOptions] = useState(false);
  const [conversionOptionsCache, setConversionOptionsCache] = useState<Map<string, { data: ConversionOptionsData; timestamp: number }>>(new Map());
  const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>(['US']);
  const [creatives, setCreatives] = useState<CreativeSlot[]>(
    Array.from({ length: 5 }).map((_, i) => ({
      index: i + 1,
      file: null,
    }))
  );
  const [previewCreative, setPreviewCreative] = useState<CreativeSlot | null>(null);
  const [placementMode, setPlacementMode] = useState<'automatic' | 'manual'>('automatic');
  const [placementTab, setPlacementTab] = useState<PlacementGroup>('feeds');
  const [selectedFacebookPositions, setSelectedFacebookPositions] = useState<string[]>([]);
  const [selectedInstagramPositions, setSelectedInstagramPositions] = useState<string[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiInputs, setAiInputs] = useState({
    goal: '',
    offer: '',
    target_audience: '',
    tone: 'energetic',
  });
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    budget: '',
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
  });
  const [managingCampaignId, setManagingCampaignId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    budget: '',
    campaignType: 'smart_link_campaign' as 'traffic' | 'smart_link_campaign',
    adAccountId: '',
    pageId: '',
    instagramId: '',
    pixelId: '',
    conversionEvent: 'LEAD',
    customConversionId: '',
    headline: '',
    message: '',
    description: '',
    smartLinkId: '',
    targetingTerms: '',
    targetingGenres: [] as string[],
    targetingBroad: true,
  });

  // Genre targeting state
  const [resolvedInterests, setResolvedInterests] = useState<Array<{ id: string; name: string; audience_size?: number }>>([]);
  const [unresolvedGenres, setUnresolvedGenres] = useState<string[]>([]);
  const [resolvingGenres, setResolvingGenres] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCampaigns();
      fetchSmartLinks();
      fetchMetaAdsContext();
    }
  }, [user]);

  useEffect(() => {
    if (showModal && user) {
      fetchMetaAssets();
    }
  }, [showModal, user]);

  // Fetch conversion options when pixel ID changes
  useEffect(() => {
    if (showModal && formData.pixelId) {
      console.log('[AdsManager] Modal opened with pixel, fetching conversion options');
      fetchConversionOptions(formData.pixelId, formData.adAccountId);
    }
  }, [showModal, formData.pixelId, formData.adAccountId]);

  // Live spend polling - sync from Meta every 60 seconds
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      console.log('[AdCampaigns] Auto-syncing spend data...');
      try {
        await fetch('/.netlify/functions/meta-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        await fetchCampaigns();
      } catch (err) {
        console.error('[AdCampaigns] Auto-sync failed:', err);
      }
    };

    // Initial tick
    tick();

    // Then every 60 seconds
    const t = setInterval(tick, 60000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user?.id]);

  // Resolve genres to Meta interests when genres change
  useEffect(() => {
    if (formData.targetingGenres.length > 0 && formData.adAccountId && showModal) {
      resolveGenres();
    } else {
      // Clear resolved interests if no genres selected
      setResolvedInterests([]);
      setUnresolvedGenres([]);
    }
  }, [formData.targetingGenres, formData.adAccountId, showModal]);

  const resolveGenres = async () => {
    if (formData.targetingGenres.length === 0) return;

    setResolvingGenres(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch('/.netlify/functions/meta-resolve-genres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adAccountId: formData.adAccountId,
          genres: formData.targetingGenres,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResolvedInterests(data.resolved || []);
        setUnresolvedGenres(data.unresolved || []);
        console.log('[AdsManager] Genre resolution:', data);
      } else {
        console.error('[AdsManager] Failed to resolve genres');
        setResolvedInterests([]);
        setUnresolvedGenres(formData.targetingGenres);
      }
    } catch (error) {
      console.error('[AdsManager] Error resolving genres:', error);
      setResolvedInterests([]);
      setUnresolvedGenres(formData.targetingGenres);
    } finally {
      setResolvingGenres(false);
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    console.log('[AdCampaigns] Fetching campaigns for user:', user?.id);

    // Fetch synced Meta campaigns (live data from Meta API)
    const { data: syncedData, error: syncedError } = await supabase
      .from('meta_campaigns')
      .select('*')
      .eq('user_id', user?.id)
      .order('last_synced_at', { ascending: false });

    // Fetch local drafts (campaigns created but not yet launched)
    const { data: draftData, error: draftError } = await supabase
      .from('meta_ad_campaigns')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (syncedError && draftError) {
      console.error('[AdCampaigns] fetchCampaigns errors:', { syncedError, draftError });
      setCampaigns([]);
    } else {
      // Normalize synced campaigns to match Campaign interface
      const syncedCampaigns = (syncedData || []).map(c => ({
        id: c.meta_campaign_id,
        campaign_id: c.meta_campaign_id,
        name: c.name || 'Untitled Campaign',
        platform: 'meta',
        status: c.status || 'UNKNOWN',
        effective_status: c.effective_status,
        daily_budget: c.daily_budget_cents || 0,
        spend: c.spend_today || 0,
        impressions: c.impressions_7d || 0,
        clicks: c.clicks_7d || 0,
        conversions: c.conversions_7d || 0,
        ad_account_id: c.ad_account_id,
        objective: c.objective,
      }));

      // Filter draft campaigns to only show campaign rows
      const draftCampaigns = (draftData || [])
        .filter(row =>
          (!row.adset_id || row.adset_id === '') &&
          (!row.ad_id || row.ad_id === '')
        )
        .map(c => ({
          ...c,
          platform: 'meta',
        }));

      // Merge: synced campaigns first, then drafts (avoiding duplicates)
      const mergedCampaigns = [
        ...syncedCampaigns,
        ...draftCampaigns.filter(d =>
          !syncedCampaigns.some(s => s.campaign_id === d.campaign_id)
        ),
      ];

      console.log('[AdCampaigns] Merged campaigns:', mergedCampaigns);
      setCampaigns(mergedCampaigns);
    }

    setLoading(false);
  };

  const fetchSmartLinks = async () => {
    const { data } = await supabase
      .from('smart_links')
      .select('id, title, slug')
      .eq('user_id', user?.id)
      .eq('is_active', true);

    if (data) setSmartLinks(data);
  };

  const fetchMetaAdsContext = async () => {
    if (!user) return;

    setLoadingMetaAssets(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      const res = await fetch('/.netlify/functions/meta-ads-context', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load Meta configuration');
      }

      const context = await res.json();

      console.log('[AdsManager] Meta ads context:', context);

      // Populate dropdowns from wizard-saved configuration
      if (context.hasConfig) {
        if (context.adAccount) {
          setMetaAccounts([{
            id: context.adAccount.id,
            name: context.adAccount.name,
            currency: context.adAccount.currency,
          }]);
          setFormData(prev => ({ ...prev, adAccountId: context.adAccount.id }));
        }

        if (context.page) {
          setMetaPages([{
            id: context.page.id,
            name: context.page.name,
            instagram_business_account_id: context.instagram?.id || undefined,
          }]);
          setFormData(prev => ({ ...prev, pageId: context.page.id }));
        }

        if (context.instagram) {
          setMetaInstagramAccounts([{
            id: context.instagram.id,
            username: context.instagram.username,
            linked_page_id: context.instagram.linked_page_id || undefined,
          }]);
          setFormData(prev => ({ ...prev, instagramId: context.instagram.id }));
        }
      } else {
        // Clear all if no config
        setMetaAccounts([]);
        setMetaPages([]);
        setMetaInstagramAccounts([]);
      }

      // Load pixels from meta_pixels table (synced from Meta API)
      const { data: pixelsData, error: pixelsError } = await supabase
        .from('meta_pixels')
        .select('meta_pixel_id, name, is_available')
        .eq('user_id', user.id)
        .eq('is_available', true)
        .order('last_synced_at', { ascending: false });

      if (pixelsError) {
        console.error('[AdsManager] Error loading pixels:', pixelsError);
      }

      if (pixelsData && pixelsData.length > 0) {
        setMetaPixels(pixelsData.map(p => ({
          id: p.meta_pixel_id,
          name: p.name || p.meta_pixel_id,
        })));
        // Auto-select first pixel if none selected
        if (!formData.pixelId && pixelsData[0]) {
          setFormData(prev => ({ ...prev, pixelId: pixelsData[0].meta_pixel_id }));
        }
      } else {
        // No pixels found - try syncing from Meta
        console.log('[AdsManager] No pixels found, triggering sync...');
        await fetch('/.netlify/functions/meta-sync-pixels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });

        // Re-fetch after sync
        const { data: syncedPixels } = await supabase
          .from('meta_pixels')
          .select('meta_pixel_id, name, is_available')
          .eq('user_id', user.id)
          .eq('is_available', true)
          .order('last_synced_at', { ascending: false });

        if (syncedPixels && syncedPixels.length > 0) {
          setMetaPixels(syncedPixels.map(p => ({
            id: p.meta_pixel_id,
            name: p.name || p.meta_pixel_id,
          })));
          if (!formData.pixelId && syncedPixels[0]) {
            setFormData(prev => ({ ...prev, pixelId: syncedPixels[0].meta_pixel_id }));
          }
        } else {
          setMetaPixels([]);
        }
      }
    } catch (error: any) {
      console.error('[AdsManager] Error fetching Meta ads context:', error);
      showToast('Failed to load Meta configuration. Please complete setup in Connected Accounts.', 'error');
    } finally {
      setLoadingMetaAssets(false);
    }
  };

  /**
   * Refresh all ads data - syncs from Meta API then reloads from Supabase
   * Calls meta-sync and meta-sync-pixels to get latest data from Meta
   */
  const refreshAdsData = async () => {
    if (!user) return;

    try {
      setIsRefreshing(true);
      console.log('[AdCampaigns] Syncing from Meta API...');

      // Sync campaigns from Meta API
      await fetch('/.netlify/functions/meta-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      // Sync pixels from Meta API
      await fetch('/.netlify/functions/meta-sync-pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      console.log('[AdCampaigns] Meta sync complete, refreshing local data...');

      // Re-fetch from Supabase to show updated data
      const tasks: Promise<any>[] = [];
      if (typeof fetchCampaigns === 'function') {
        tasks.push(fetchCampaigns());
      }
      if (typeof fetchSmartLinks === 'function') {
        tasks.push(fetchSmartLinks());
      }
      if (typeof fetchMetaAdsContext === 'function') {
        tasks.push(fetchMetaAdsContext());
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      console.log('[AdCampaigns] Refresh complete');
      showToast('Campaigns and pixels synced from Meta', 'success');
    } catch (err: any) {
      console.error('[AdCampaigns] refreshAdsData error:', err);
      showToast('Failed to sync from Meta', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchMetaAssets = async () => {
    setLoadingMetaAssets(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[AdsManager] No session found');
        setLoadingMetaAssets(false);
        return;
      }

      const res = await fetch('/.netlify/functions/meta-connected-assets', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('[AdsManager] Failed to load meta assets:', data);
        showToast(data.message || 'Failed to load Meta accounts', 'error');
        setMetaAccounts([]);
        setMetaPages([]);
        setMetaInstagramAccounts([]);
        setMetaPixels([]);
        setLoadingMetaAssets(false);
        return;
      }

      // Handle success: false response (e.g., no credentials)
      if (data.success === false) {
        console.warn('[AdsManager] No Meta credentials available:', data.message);
        showToast(data.message || 'No Meta credentials found. Please connect in Profile → Connected Accounts.', 'warning');
        setMetaAccounts([]);
        setMetaPages([]);
        setMetaInstagramAccounts([]);
        setMetaPixels([]);
        setLoadingMetaAssets(false);
        return;
      }

      console.log('[AdsManager] Meta assets response:', {
        success: data.success,
        accountsCount: data.adAccounts?.length || 0,
        pagesCount: data.pages?.length || 0,
        instagramCount: data.instagramAccounts?.length || 0,
        pixelsCount: data.pixels?.length || 0,
        defaults: data.defaults,
      });

      setMetaAccounts(data.adAccounts || []);
      setMetaPages(data.pages || []);
      setMetaInstagramAccounts(data.instagramAccounts || []);
      setMetaPixels(data.pixels || []);

      // 🔥 Check if Instagram actor ID exists in credentials
      const instagramActorIdExists = !!(
        data.defaults?.instagramActorId ||
        data.defaults?.instagram_actor_id ||
        (data.instagramAccounts && data.instagramAccounts.length > 0)
      );
      setHasInstagramActorId(instagramActorIdExists);

      if (!instagramActorIdExists) {
        console.warn('[AdsManager] ⚠️ No Instagram Business Account linked - campaigns will be Facebook-only');
      }

      console.log('[AdsManager] Meta assets loaded successfully:', {
        accounts: data.adAccounts?.length || 0,
        pages: data.pages?.length || 0,
        instagram: data.instagramAccounts?.length || 0,
        pixels: data.pixels?.length || 0,
        hasInstagramActorId: instagramActorIdExists,
      });

      // Auto-populate form with defaults from meta_credentials
      if (data.defaults) {
        console.log('[AdsManager] Auto-populating form with defaults from meta_credentials:', data.defaults);
        setFormData(prev => ({
          ...prev,
          adAccountId: data.defaults.adAccountId || prev.adAccountId,
          pageId: data.defaults.pageId || prev.pageId,
          instagramId: data.defaults.instagramId || prev.instagramId,
          pixelId: data.defaults.pixelId || prev.pixelId,
        }));

        // Fetch pixels for the selected ad account (same as wizard)
        if (data.defaults.adAccountId) {
          fetchPixelsForAdAccount(data.defaults.adAccountId, session.access_token);
        }
      }
    } catch (error: any) {
      console.error('[AdsManager] Error loading meta assets:', error);
      showToast('Error loading Meta accounts', 'error');
      setMetaAccounts([]);
      setMetaPages([]);
      setMetaInstagramAccounts([]);
      setMetaPixels([]);
    } finally {
      setLoadingMetaAssets(false);
    }
  };

  // Fetch pixels for a specific ad account
  const fetchPixelsForAdAccount = async (adAccountId: string, accessToken: string, debug = false) => {
    if (!user) return;

    try {
      console.log('[AdsManager] Fetching pixels for ad account:', adAccountId);
      const debugParam = debug ? '&debug=1' : '';
      const res = await fetch(`/.netlify/functions/meta-list-pixels?userId=${user.id}${debugParam}`);

      if (res.ok) {
        const pixelData = await res.json();
        const fetchedPixels = pixelData.pixels || [];
        console.log('[AdsManager] Fetched pixels from Meta API:', fetchedPixels.length);
        setMetaPixels(fetchedPixels);

        // Store debug info if present
        if (pixelData.debug) {
          setPixelDebugInfo(pixelData.debug);
        }
      } else {
        console.warn('[AdsManager] Failed to fetch pixels, using empty list');
        setMetaPixels([]);
      }
    } catch (err) {
      console.warn('[AdsManager] Error fetching pixels:', err);
      setMetaPixels([]);
    }
  };

  // Refresh pixels with debug info
  const refreshPixels = async () => {
    if (!user) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await fetchPixelsForAdAccount('', session.access_token, true);
    }
  };

  // Fetch conversion options (pixel events + custom conversions + standard events)
  const fetchConversionOptions = async (pixelId?: string, adAccountId?: string, forceRefresh = false) => {
    if (!user || !pixelId) return;

    // Check cache first (10 min expiry)
    const cacheKey = `${pixelId}_${adAccountId || 'no-account'}`;
    const cached = conversionOptionsCache.get(cacheKey);
    const now = Date.now();
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    if (cached && !forceRefresh && (now - cached.timestamp < CACHE_DURATION)) {
      console.log('[AdsManager] Using cached conversion options');
      setConversionOptions(cached.data);
      // Still populate customConversions for backward compatibility
      setCustomConversions(cached.data.customConversions);
      return;
    }

    setLoadingConversionOptions(true);

    try {
      const params = new URLSearchParams({
        pixelId,
        userId: user.id,
      });

      if (adAccountId) {
        params.append('adAccountId', adAccountId);
      }

      const res = await fetch(`/.netlify/functions/meta-conversion-options?${params.toString()}`);

      if (res.ok) {
        const data: ConversionOptionsData = await res.json();
        console.log('[AdsManager] Fetched conversion options:', {
          standardEvents: data.standardEvents.length,
          customEventNames: data.customEventNames.length,
          customConversions: data.customConversions.length,
          recommended: data.recommended,
        });

        setConversionOptions(data);

        // Update cache
        setConversionOptionsCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, { data, timestamp: now });
          return newCache;
        });

        // For backward compatibility, populate customConversions state
        setCustomConversions(data.customConversions);

        // Store debug info if available
        if (data.debug) {
          console.log('[AdsManager] Conversion options debug:', data.debug);
          setPixelDebugInfo(data.debug);
        }

        // Auto-select recommended event if nothing is selected
        if (!formData.customConversionId && !formData.conversionEvent && data.recommended.length > 0) {
          const recommended = data.recommended[0];

          // Check if it's a custom conversion
          const customConv = data.customConversions.find(cc => cc.name === recommended);
          if (customConv) {
            console.log('[AdsManager] Auto-selecting recommended custom conversion:', customConv.name);
            setFormData(prev => ({ ...prev, customConversionId: customConv.id, conversionEvent: '' }));
          } else {
            // It's a pixel event or standard event
            console.log('[AdsManager] Auto-selecting recommended event:', recommended);
            setFormData(prev => ({ ...prev, conversionEvent: recommended, customConversionId: '' }));
          }
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.warn('[AdsManager] Failed to fetch conversion options:', errorData);

        // Use fallback from error response if available
        if (errorData.standardEvents) {
          setConversionOptions(errorData as ConversionOptionsData);
        }
        setCustomConversions([]);
      }
    } catch (err) {
      console.warn('[AdsManager] Error fetching conversion options:', err);
      setCustomConversions([]);
    } finally {
      setLoadingConversionOptions(false);
    }
  };

  // Fetch Instagram account for a specific page
  const fetchInstagramForPage = async (pageId: string, accessToken: string) => {
    try {
      console.log('[AdsManager] Fetching Instagram for page:', pageId);
      const res = await fetch('/.netlify/functions/meta-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          type: 'instagram_accounts',
          page_id: pageId,
        }),
      });

      if (res.ok) {
        const igData = await res.json();
        const fetchedIg = igData.items || [];
        console.log('[AdsManager] Fetched Instagram accounts:', fetchedIg.length);
        if (fetchedIg.length > 0) {
          const ig = fetchedIg[0];
          setMetaInstagramAccounts([{
            id: ig.id,
            username: ig.username || ig.name || '',
            linked_page_id: pageId,
          }]);
          // Auto-select the IG account
          setFormData(prev => ({ ...prev, instagramId: ig.id }));
        } else {
          console.log('[AdsManager] No Instagram business account connected to this page');
          setMetaInstagramAccounts([]);
          setFormData(prev => ({ ...prev, instagramId: '' }));
        }
      } else {
        console.warn('[AdsManager] Failed to fetch Instagram, clearing list');
        setMetaInstagramAccounts([]);
        setFormData(prev => ({ ...prev, instagramId: '' }));
      }
    } catch (err) {
      console.warn('[AdsManager] Error fetching Instagram:', err);
      setMetaInstagramAccounts([]);
      setFormData(prev => ({ ...prev, instagramId: '' }));
    }
  };


  const handleCreativeChange = (index: number, creative: CreativeSlot) => {
    setCreatives((prev) =>
      prev.map((c) => (c.index === index ? creative : c))
    );
  };

  const handleCreativeError = (error: string) => {
    showToast(error, 'error');
  };

  const openPreview = (slot: CreativeSlot) => setPreviewCreative(slot);
  const closePreview = () => setPreviewCreative(null);

  const handleGenerateAiCopy = async () => {
    if (!aiInputs.goal || !aiInputs.offer) {
      showToast('Please provide a goal and offer', 'error');
      return;
    }

    setAiGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Use Ghoste AI Edge Function for ad copy generation
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('ghoste-ai', {
        body: {
          user_id: user?.id,
          task: 'ad_copy',
          payload: {
            track_title: aiInputs.offer || 'New Release',
            artist_name: user?.user_metadata?.display_name || 'Artist',
            platform: 'Meta',
            goal: aiInputs.goal || 'streams',
          },
        },
      });

      if (aiError || !aiResponse?.ok) {
        throw new Error(aiError?.message || 'Failed to generate ad copy');
      }

      // Extract ad copy from AI response
      const adCopy = aiResponse.result?.copy || '';

      if (adCopy) {
        // Parse the copy and auto-fill form fields
        // AI returns formatted text, extract headline and description
        const lines = adCopy.split('\n').filter(l => l.trim());
        const headline = lines[0]?.substring(0, 125) || '';
        const primaryText = lines.slice(1).join(' ').substring(0, 400) || adCopy;

        setFormData(prev => ({
          ...prev,
          headline: headline || prev.headline,
          message: primaryText || prev.message,
        }));

        showToast('Ad copy generated successfully!', 'success');
        setShowAiModal(false);

        // Reset AI inputs
        setAiInputs({
          goal: '',
          offer: '',
          target_audience: '',
          tone: 'energetic',
        });
      } else {
        throw new Error('Invalid response from AI');
      }
    } catch (error: any) {
      console.error('[AdsManager] AI generation error:', error);
      showToast('Error: ' + (error.message || 'Failed to generate ad copy'), 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const isVideo = (slot: CreativeSlot | null) =>
    !!slot &&
    ((slot.fileType && slot.fileType.startsWith('video/')) ||
      (slot.publicUrl && /\.(mp4|mov|webm)$/i.test(slot.publicUrl)));

  const uploadedCreatives = creatives.filter((c) => c.publicUrl);

  const selectedPublisherPlatforms = useMemo<PlacementPlatform[]>(() => {
    const platforms = new Set<PlacementPlatform>();
    if (placementMode === 'automatic') {
      platforms.add('facebook');
      platforms.add('instagram');
    } else {
      if (selectedFacebookPositions.length > 0) platforms.add('facebook');
      if (selectedInstagramPositions.length > 0) platforms.add('instagram');
    }
    return Array.from(platforms);
  }, [placementMode, selectedFacebookPositions, selectedInstagramPositions]);

  const handleSubmit = async (e: React.FormEvent, options?: { saveAsDraft?: boolean }) => {
    e.preventDefault();

    const uploadedCreatives = creatives.filter((c) => c.publicUrl);
    const saveAsDraft = options?.saveAsDraft || false;

    if (!formData.name || !formData.budget || uploadedCreatives.length === 0) {
      showToast('Please fill in required fields and upload at least Creative 1', 'error');
      return;
    }

    if (selectedCountryCodes.length === 0) {
      showToast('Please select at least one target country', 'error');
      return;
    }

    if (!formData.adAccountId || !formData.pageId) {
      showToast('Please select an Ad Account and Facebook Page', 'error');
      return;
    }

    if (!formData.pixelId) {
      showToast('Please select a Pixel for conversion tracking', 'error');
      return;
    }

    // Only spend credits if actually launching (not drafting)
    if (!saveAsDraft) {
      try {
        await spendForFeature('meta_launch_campaign');
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('PRO_REQUIRED')) {
          showToast('Ghoste Pro required - Meta ad campaigns are a Pro feature', 'error');
        } else if (msg.includes('INSUFFICIENT')) {
          showToast('Not enough Manager credits. Top up your wallet to launch campaigns.', 'error');
        } else {
          showToast('Failed to reserve credits for campaign launch', 'error');
        }
        return;
      }
    }

    setSubmitting(true);

    try {
      // Get smart link URL if one is selected
      let linkUrl = '';
      if (formData.smartLinkId) {
        const smartLink = smartLinks.find((l) => l.id === formData.smartLinkId);
        if (smartLink) {
          linkUrl = `https://ghoste.one/l/${smartLink.slug}`;
        }
      }

      // Prepare creatives payload
      const creativesPayload = uploadedCreatives.map((slot) => ({
        index: slot.index,
        url: slot.publicUrl!,
        fileType: slot.fileType || null,
      }));

      // Call Netlify function to create Meta campaign
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Determine if Instagram should be included
      // Include Instagram only if user has selected an Instagram ID (not "No Instagram Profile")
      const shouldIncludeInstagram = !!(formData.instagramId && formData.instagramId.trim().length > 0);

      console.log('[AdsManager] Creating campaign with placement choice:', {
        includeInstagram: shouldIncludeInstagram,
        instagramId: formData.instagramId || 'none',
        placementMode,
      });

      // Determine budget field based on campaign type
      const budgetPayload: any = {
        campaignName: formData.name,
        campaignType: formData.campaignType || 'smart_link_campaign',
        adAccountId: formData.adAccountId,
        pageId: formData.pageId,
        instagramId: formData.instagramId || null,
        instagramActorId: formData.instagramId && formData.instagramId !== '' ? formData.instagramId : 'none',
        pixelId: formData.pixelId,
        conversionEvent: formData.conversionEvent || undefined,
        customConversionId: formData.customConversionId || undefined,
        linkUrl: linkUrl || 'https://ghoste.one',
        headline: formData.headline,
        primaryText: formData.message,
        description: formData.description || '',
        targetingCountries: selectedCountryCodes,
        creatives: creativesPayload,
        placementMode,
        placement: {
          publisherPlatforms: selectedPublisherPlatforms,
          facebookPositions: selectedFacebookPositions,
          instagramPositions: selectedInstagramPositions,
        },
        // NEW: Explicit Instagram inclusion flag
        placements: {
          includeInstagram: shouldIncludeInstagram,
          includeFacebook: true,
        },
        // For Smart Link campaigns, use resolved genre interests
        // For other campaigns, use old targetingTerms
        targetingTerms: formData.campaignType === 'smart_link_campaign'
          ? [] // Don't use old targeting for Smart Link
          : formData.targetingTerms
          ? formData.targetingTerms.split(',').map(t => t.trim()).filter(Boolean)
          : [],
        // Pass resolved interests for Smart Link campaigns
        resolvedInterests: formData.campaignType === 'smart_link_campaign' ? resolvedInterests : undefined,
        targetingBroad: formData.campaignType === 'smart_link_campaign' ? formData.targetingBroad : undefined,
        saveAsDraft: saveAsDraft,
      };

      // Add budget field (daily or lifetime based on campaign type)
      if (formData.campaignType === 'smart_link_campaign') {
        budgetPayload.lifetimeBudget = formData.budget;
      } else {
        budgetPayload.dailyBudget = formData.budget;
      }

      const res = await fetch('/.netlify/functions/meta-create-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(budgetPayload),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        // Extract meaningful Meta error if available
        const metaMessage = result.metaError?.error?.message || result.message || result.error;
        throw new Error(metaMessage || 'Failed to create Meta campaign');
      }

      // Campaign is saved to database by the backend function
      // Just refetch to show the new campaign
      if (saveAsDraft) {
        showToast(`Campaign draft saved! Launch it anytime from the Ads Manager.`, 'success');
      } else {
        showToast(`Meta campaign created with ${creativesPayload.length} ads!`, 'success');
      }
      await fetchCampaigns();
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('Campaign creation error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      budget: '',
      campaignType: 'smart_link_campaign' as 'traffic' | 'smart_link_campaign',
      adAccountId: '',
      pageId: '',
      instagramId: '',
      pixelId: '',
      conversionEvent: 'LEAD',
      customConversionId: '',
      headline: '',
      message: '',
      description: '',
      smartLinkId: '',
      targetingTerms: '',
      targetingGenres: [],
      targetingBroad: true,
    });
    setSelectedCountryCodes(['US']);
    setResolvedInterests([]);
    setUnresolvedGenres([]);
    setCreatives(
      Array.from({ length: 5 }).map((_, i) => ({
        index: i + 1,
        file: null,
      }))
    );
  };

  // Simplified campaign creation (campaign only, no ad set or ads)
  const handleQuickCreateCampaign = async () => {
    if (!formData.name || !formData.adAccountId) {
      showToast('Please enter campaign name and select an ad account', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      console.log('[QuickCreate] Creating simple campaign');

      const res = await fetch('/.netlify/functions/meta-create-campaign-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          adAccountId: formData.adAccountId,
          name: formData.name,
          objective: 'OUTCOME_TRAFFIC',
          status: 'PAUSED',
          specialAdCategories: ['NONE'],
        }),
      });

      const result = await res.json();

      console.log('[QuickCreate] Result:', result);

      if (!res.ok || !result.success) {
        const errorMsg = result.details?.error?.message || result.message || result.error;
        console.error('[QuickCreate] Failed:', result);
        showToast(`Meta error: ${errorMsg}`, 'error');
        return;
      }

      showToast(`Campaign "${formData.name}" created! (Campaign only, no ads yet)`, 'success');
      await fetchCampaigns();
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('[QuickCreate] Error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Build Instagram options from pages that have instagram_business_account_id
  const instagramOptions = useMemo(() => {
    // If a page is selected, show only that page's Instagram (if it has one)
    if (formData.pageId) {
      const selectedPage = metaPages.find(p => p.id === formData.pageId);
      if (selectedPage?.instagram_business_account_id) {
        return [{
          id: selectedPage.instagram_business_account_id,
          username: (selectedPage as any).instagram_username || 'Instagram Account',
          linked_page_id: selectedPage.id,
        }];
      }
      return [];
    }

    // If no page selected, show all pages with Instagram
    return metaPages
      .filter(p => p.instagram_business_account_id)
      .map(p => ({
        id: p.instagram_business_account_id!,
        username: (p as any).instagram_username || 'Instagram Account',
        linked_page_id: p.id,
      }));
  }, [metaPages, formData.pageId]);

  // For backwards compatibility, also include legacy Instagram accounts
  const filteredInstagramAccounts = useMemo(() => {
    const combined = [...instagramOptions];

    // Add any Instagram accounts fetched separately (legacy support)
    if (metaInstagramAccounts.length > 0) {
      metaInstagramAccounts.forEach(ig => {
        if (ig.linked_page_id === formData.pageId) {
          // Only add if not already in the list
          if (!combined.find(c => c.id === ig.id)) {
            combined.push(ig);
          }
        }
      });
    }

    return combined;
  }, [instagramOptions, metaInstagramAccounts, formData.pageId]);

  /**
   * Get clean Instagram label for dropdown
   */
  function getIGLabel(acct: any) {
    const username =
      acct?.username ||
      acct?.instagram_business_account?.username ||
      acct?.ig_username;

    const name = acct?.name || acct?.display_name;

    if (username) return `@${username}`;
    if (name) return name;

    const id = String(acct?.id || acct?.instagram_id || acct?.ig_user_id || "");
    if (id) return `IG Account (…${id.slice(-6)})`;

    return "Instagram Account";
  }

  /**
   * Call meta-manage-campaigns API
   */
  async function callMetaManageApi(body: any) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No session found');
    }

    const res = await fetch('/.netlify/functions/meta-manage-campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || 'API request failed');
    }

    return res.json();
  }

  /**
   * Toggle campaign active/paused
   * Also toggles all associated ad sets
   */
  const handleToggleCampaign = async (campaign: Campaign) => {
    const currentStatus = getCampaignStatus(campaign.status, campaign.effective_status);
    const isCurrentlyOn = isConsideredOn(currentStatus);
    const newActive = !isCurrentlyOn; // Toggle: if ON, turn OFF (PAUSED), if OFF, turn ON (ACTIVE)

    console.log('[handleToggleCampaign]', {
      campaignId: campaign.campaign_id,
      currentStatus,
      isCurrentlyOn,
      newActive,
    });

    setManagingCampaignId(campaign.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      const res = await fetch('/.netlify/functions/meta-manage-campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'toggleCampaign',
          campaignId: campaign.campaign_id || campaign.id,
          active: newActive,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // Handle specific META_NOT_CONFIGURED error
        if (data?.error === 'META_NOT_CONFIGURED') {
          showToast('Please finish your Meta setup in Profile → Connected Accounts.', 'error');
          return;
        }
        // Generic error for other cases
        throw new Error(data?.message || data?.error || 'Failed to update campaign');
      }

      console.log('[handleToggleCampaign] Result from backend:', data);

      // Update local state with returned campaign data from backend
      setCampaigns(prev =>
        prev.map(c =>
          c.campaign_id === (campaign.campaign_id || campaign.id)
            ? (data.campaign ? { ...c, ...data.campaign } : { ...c, status: data.status })
            : c
        )
      );

      showToast(`Campaign ${newActive ? 'activated' : 'paused'} (including ad sets & ads)`, 'success');
    } catch (error: any) {
      console.error('[handleToggleCampaign] Error:', error);
      showToast(`Failed to toggle campaign. Please try again.`, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  /**
   * Open edit dialog
   */
  const handleOpenEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    const budgetValue = campaign.daily_budget || campaign.budget || 0;
    setEditFormData({
      name: campaign.name,
      budget: budgetValue ? (budgetValue / 100).toFixed(2) : '',
      objective: campaign.objective || 'OUTCOME_TRAFFIC',
      status: campaign.status || 'PAUSED',
    });
  };

  /**
   * Save campaign edits (full fields)
   */
  const handleSaveEdit = async () => {
    if (!editingCampaign) return;

    setManagingCampaignId(editingCampaign.id);

    try {
      const payload: any = {
        action: 'updateCampaign',
        campaignId: editingCampaign.campaign_id || editingCampaign.id,
      };

      // Name
      if (editFormData.name && editFormData.name !== editingCampaign.name) {
        payload.name = editFormData.name;
      }

      // Budget (keep existing cents conversion)
      if (editFormData.budget) {
        const budgetCents = Math.round(parseFloat(editFormData.budget) * 100);
        const currentBudget = editingCampaign.daily_budget || editingCampaign.budget || 0;
        if (budgetCents !== currentBudget) {
          payload.dailyBudget = budgetCents;
        }
      }

      // Objective
      if (editFormData.objective && editFormData.objective !== (editingCampaign as any).objective) {
        payload.objective = editFormData.objective;
      }

      // Status
      if (editFormData.status && editFormData.status !== editingCampaign.status) {
        payload.status = editFormData.status;
      }

      // Always send special ad categories
      payload.specialAdCategories = ['NONE'];

      const result = await callMetaManageApi(payload);

      // Update local state
      if (result.campaign) {
        setCampaigns(prev =>
          prev.map(c =>
            c.id === editingCampaign.id
              ? { ...c, ...result.campaign }
              : c
          )
        );
      }

      showToast('Campaign updated successfully', 'success');
      setEditingCampaign(null);
    } catch (error: any) {
      console.error('[handleSaveEdit] Error:', error);
      showToast(`Failed to update campaign: ${error.message}`, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  /**
   * Duplicate campaign
   */
  const handleDuplicateCampaign = async (campaign: Campaign) => {
    if (!confirm(`Duplicate campaign "${campaign.name}"?`)) return;

    setManagingCampaignId(campaign.id);

    try {
      const result = await callMetaManageApi({
        action: 'duplicateCampaign',
        campaignId: campaign.campaign_id || campaign.id,
      });

      if (result.campaign) {
        // Add new campaign to list
        setCampaigns(prev => [result.campaign, ...prev]);
        showToast('Campaign duplicated successfully', 'success');
      }
    } catch (error: any) {
      console.error('[handleDuplicateCampaign] Error:', error);
      showToast(`Failed to duplicate campaign: ${error.message}`, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  const safeCampaigns = campaigns ?? [];
  const totalStats = safeCampaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + safeNumber(c?.spend),
      impressions: acc.impressions + safeNumber(c?.impressions),
      clicks: acc.clicks + safeNumber(c?.clicks),
      conversions: acc.conversions + safeNumber(c?.conversions),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  // Build grouped conversion options for dropdown
  const conversionDropdownOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; disabled?: boolean }> = [];

    if (!conversionOptions) {
      // Fallback to old behavior if conversionOptions not loaded
      if (customConversions.length > 0) {
        options.push({ value: '__divider_custom__', label: `── Custom Conversions (${customConversions.length}) ──`, disabled: true });
        customConversions.forEach(cc => {
          options.push({
            value: cc.id,
            label: `${cc.name}`,
          });
        });
        options.push({ value: '__divider_standard__', label: `── Standard Events ──`, disabled: true });
      }
      CONVERSION_EVENTS.forEach(event => {
        options.push({ value: event.value, label: event.label });
      });
      return options;
    }

    // RECOMMENDED
    if (conversionOptions.recommended.length > 0) {
      options.push({ value: '__divider_recommended__', label: '★ Recommended', disabled: true });
      conversionOptions.recommended.forEach(name => {
        // Check if it's a custom conversion or event
        const cc = conversionOptions.customConversions.find(c => c.name === name);
        if (cc) {
          options.push({ value: cc.id, label: `${cc.name} (Custom)` });
        } else {
          options.push({ value: name, label: name });
        }
      });
    }

    // CUSTOM PIXEL EVENTS
    if (conversionOptions.customEventNames.length > 0) {
      options.push({ value: '__divider_pixel__', label: `── Your Pixel Events (${conversionOptions.customEventNames.length}) ──`, disabled: true });
      conversionOptions.customEventNames.forEach(name => {
        options.push({ value: name, label: name });
      });
    }

    // CUSTOM CONVERSIONS
    if (conversionOptions.customConversions.length > 0) {
      options.push({ value: '__divider_custom__', label: `── Custom Conversions (${conversionOptions.customConversions.length}) ──`, disabled: true });
      conversionOptions.customConversions.forEach(cc => {
        options.push({
          value: cc.id,
          label: `${cc.name} (CC)`,
        });
      });
    }

    // STANDARD EVENTS
    if (conversionOptions.standardEvents.length > 0) {
      options.push({ value: '__divider_standard__', label: '── Standard Events ──', disabled: true });
      conversionOptions.standardEvents.forEach(name => {
        const event = CONVERSION_EVENTS.find(e => e.value === name || e.label === name);
        options.push({
          value: event?.value || name,
          label: event?.label || name,
        });
      });
    }

    return options;
  }, [conversionOptions, customConversions]);

  return (
    <ProGate feature="Meta Ad Campaigns" action="create and manage" fullPage>
      <div>
      <MetaConnectBanner context="ads" />
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-400">Create and manage Meta ad campaigns</p>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAdsData}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Refresh campaigns and stats"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Create Ad Campaign
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Spend</span>
          </div>
          <div className="text-2xl font-bold">${safeToFixed(totalStats.spend, 2)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Impressions</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.impressions.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <MousePointer className="w-4 h-4" />
            <span className="text-sm">Clicks</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.clicks.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Conversions</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.conversions.toLocaleString()}</div>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No campaigns yet</h3>
          <p className="text-gray-500">Create your first Meta ad campaign</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => {
            // Derive status using new helpers
            const status = getCampaignStatus(campaign.status, campaign.effective_status);
            const statusLabel = getStatusLabel(status);
            const statusColor = getStatusColor(status);
            const isToggleChecked = isConsideredOn(status);
            const isManaging = managingCampaignId === campaign.id;

            // Debug logging
            if (process.env.NODE_ENV === 'development') {
              console.log('[CampaignCard]', {
                name: campaign.name,
                rawStatus: campaign.status,
                effectiveStatus: campaign.effective_status,
                normalizedStatus: status,
                isToggleChecked,
              });
            }

            return (
            <div key={campaign.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{campaign.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status Badge */}
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700">
                    <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
                    <span>{statusLabel}</span>
                  </span>

                  {/* On/Off Toggle - ON unless truly off */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isToggleChecked}
                        onChange={() => handleToggleCampaign(campaign)}
                        disabled={isManaging}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                  </label>

                  {/* Edit Button */}
                  <button
                    onClick={() => handleOpenEdit(campaign)}
                    disabled={isManaging}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                    title="Edit campaign"
                  >
                    <Edit className="w-4 h-4 text-gray-400" />
                  </button>

                  {/* Duplicate Button */}
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    disabled={isManaging}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                    title="Duplicate campaign"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-400">Budget</div>
                  <div className="text-lg font-semibold">
                    ${safeToFixed((campaign?.daily_budget || campaign?.budget || 0) / 100, 2)}/day
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Spend</div>
                  <div className="text-lg font-semibold">${safeToFixed(campaign?.spend || 0, 2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Clicks</div>
                  <div className="text-lg font-semibold">{safeNumber(campaign?.clicks)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Conversions</div>
                  <div className="text-lg font-semibold">{safeNumber(campaign?.conversions)}</div>
                </div>
              </div>
              {isManaging && (
                <div className="mt-4 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Edit Campaign Modal */}
      {editingCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-xl max-w-md w-full border border-gray-800">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold">Edit Campaign</h2>
              <button
                onClick={() => setEditingCampaign(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Campaign Name</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter campaign name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Daily Budget ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={editFormData.budget}
                  onChange={(e) => setEditFormData({ ...editFormData, budget: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="10.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Campaign Objective</label>
                <select
                  value={editFormData.objective}
                  onChange={(e) => setEditFormData({ ...editFormData, objective: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="OUTCOME_TRAFFIC">Traffic (Outcome)</option>
                  <option value="OUTCOME_AWARENESS">Awareness (Outcome)</option>
                  <option value="OUTCOME_ENGAGEMENT">Engagement (Outcome)</option>
                  <option value="OUTCOME_LEADS">Leads (Outcome)</option>
                  <option value="OUTCOME_SALES">Sales (Outcome)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Campaign Status</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setEditingCampaign(null)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={managingCampaignId === editingCampaign.id}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {managingCampaignId === editingCampaign.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Create Meta Ad Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Campaign Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Campaign Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, campaignType: 'smart_link_campaign' })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      formData.campaignType === 'smart_link_campaign'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${formData.campaignType === 'smart_link_campaign' ? 'bg-emerald-400' : 'bg-gray-600'}`}></div>
                      <span className="text-sm font-semibold">Smart Link Campaign</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Advantage+</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Sales objective • Lifetime budget • FB + IG only • Optimized for conversions
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, campaignType: 'traffic' })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      formData.campaignType === 'traffic'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${formData.campaignType === 'traffic' ? 'bg-blue-400' : 'bg-gray-600'}`}></div>
                      <span className="text-sm font-semibold">Traffic Campaign</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Traffic objective • Daily budget • All placements • Classic setup
                    </p>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {formData.campaignType === 'smart_link_campaign'
                    ? '✨ Recommended: Add lifetime budget over time without restarting. Automatically optimizes for sales conversions.'
                    : 'Standard daily budget campaign for link clicks and website traffic.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ad Account *</label>
                <StyledSelect
                  value={formData.adAccountId}
                  onChange={(value) => {
                    setFormData({ ...formData, adAccountId: value });
                    // Fetch custom conversions for this ad account
                    if (value) {
                      console.log('[AdsManager] Ad account changed, fetching custom conversions for:', value);
                      fetchCustomConversions();
                    } else {
                      setCustomConversions([]);
                    }
                  }}
                  options={metaAccounts.map((acc) => ({
                    value: acc.id,
                    label: `${acc.name}${acc.currency ? ` (${acc.currency})` : ''}`,
                  }))}
                  placeholder={loadingMetaAssets ? 'Loading Meta accounts...' : 'Select Account'}
                  prefix={<span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/70" />}
                  disabled={loadingMetaAssets}
                />
                {!loadingMetaAssets && metaAccounts.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No Meta ad accounts found. Connect Meta in Connected Accounts first.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Facebook Page *</label>
                <StyledSelect
                  value={formData.pageId}
                  onChange={async (value) => {
                    setFormData({ ...formData, pageId: value, instagramId: '' });
                    // Fetch Instagram account for this page
                    if (value) {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (session) {
                        fetchInstagramForPage(value, session.access_token);
                      }
                    } else {
                      setMetaInstagramAccounts([]);
                    }
                  }}
                  options={metaPages.map((page) => ({
                    value: page.id,
                    label: page.name,
                  }))}
                  placeholder={loadingMetaAssets ? 'Loading pages...' : 'Select Page'}
                  prefix={formData.pageId ? <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/70" /> : null}
                  disabled={loadingMetaAssets}
                />
                {!loadingMetaAssets && metaPages.length === 0 && (
                  <p className="mt-1 text-[11px] text-white/40">
                    No Facebook pages found. Make sure your Meta account has at least one Page and that you granted page access when connecting.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Instagram Profile (Optional)</label>
                <StyledSelect
                  value={formData.instagramId}
                  onChange={(value) => {
                    console.log('[AdsManager] Instagram selected:', value);
                    setFormData({ ...formData, instagramId: value });
                  }}
                  options={[
                    { value: '', label: 'No Instagram Profile (Facebook only)' },
                    ...filteredInstagramAccounts.map((ig) => ({
                      value: ig.id, // This is instagram_business_account_id
                      label: ig.username ? `@${ig.username}` : 'Instagram Account',
                    })),
                  ]}
                  placeholder={loadingMetaAssets ? 'Loading Instagram accounts...' : 'No Instagram Profile'}
                  disabled={loadingMetaAssets || !formData.pageId}
                  prefix={formData.instagramId ? <span className="mr-1 inline-block h-2 w-2 rounded-full bg-pink-400 shadow shadow-pink-500/70" /> : null}
                />
                {filteredInstagramAccounts.length === 0 && !loadingMetaAssets && formData.pageId && (
                  <p className="mt-1 text-[11px] text-white/40">
                    No Instagram Profile connected to this Page. Connect an Instagram Business Account to your Facebook Page in <a href="https://business.facebook.com/settings" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Meta Business Settings</a>.
                  </p>
                )}
                {filteredInstagramAccounts.length > 0 && !loadingMetaAssets && (
                  <p className="mt-1 text-[11px] text-white/40">
                    ✓ Instagram connected. Ads can run on both Facebook and Instagram.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Pixel *</label>
                  {metaPixels.length === 0 && (
                    <button
                      type="button"
                      onClick={refreshPixels}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      Refresh
                    </button>
                  )}
                </div>
                <StyledSelect
                  value={formData.pixelId}
                  onChange={(value) => {
                    setFormData({ ...formData, pixelId: value });
                    // Optionally filter custom conversions by pixel (custom conversions are ad-account-scoped)
                    // Refresh to filter by specific pixel if selected, or show all if cleared
                    if (formData.adAccountId) {
                      fetchCustomConversions(value || undefined);
                    }
                  }}
                  options={metaPixels.map((px) => ({
                    value: px.id,
                    label: `${px.name} (ID: ${px.id})`,
                  }))}
                  placeholder={loadingMetaAssets ? 'Loading pixels...' : 'Select Pixel'}
                  prefix={formData.pixelId ? <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/70" /> : null}
                  disabled={loadingMetaAssets}
                />
                {!loadingMetaAssets && metaPixels.length === 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-white/40">
                      No pixels found. Click Refresh or create a pixel in Meta Business Settings.
                    </p>
                    {pixelDebugInfo && (
                      <details className="text-[10px] text-white/30">
                        <summary className="cursor-pointer hover:text-white/50">Debug Info</summary>
                        <div className="mt-1 p-2 bg-gray-800 rounded font-mono">
                          <div>Source: {pixelDebugInfo.sourceUsed}</div>
                          <div>Ad Account Pixels: {pixelDebugInfo.counts?.adAccountPixels || 0}</div>
                          <div>Business Pixels: {pixelDebugInfo.counts?.businessPixels || 0}</div>
                          <div>Total: {pixelDebugInfo.counts?.merged || 0}</div>
                          <div>Ad Account: {pixelDebugInfo.adAccountIdUsed || 'none'}</div>
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Conversion Event *</label>
                  {formData.pixelId && (
                    <button
                      type="button"
                      onClick={() => fetchConversionOptions(formData.pixelId, formData.adAccountId, true)}
                      disabled={loadingConversionOptions}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCw className={`w-3 h-3 ${loadingConversionOptions ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  )}
                </div>
                <StyledSelect
                  value={formData.customConversionId || formData.conversionEvent}
                  onChange={(value) => {
                    // Check if this is a custom conversion (numeric ID) or event name
                    const isCustomConversion = customConversions.some(cc => cc.id === value);
                    const isPixelEvent = conversionOptions?.customEventNames.includes(value);

                    if (isCustomConversion) {
                      setFormData({ ...formData, customConversionId: value, conversionEvent: '' });
                    } else {
                      setFormData({ ...formData, conversionEvent: value, customConversionId: '' });
                    }
                  }}
                  options={conversionDropdownOptions}
                  placeholder={loadingConversionOptions ? "Loading events..." : "Select Conversion Event"}
                  prefix={<span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-400 shadow shadow-purple-500/70" />}
                />
                <p className="mt-1 text-[11px] text-white/40">
                  {!formData.pixelId
                    ? 'Select a pixel first to see conversion events.'
                    : loadingConversionOptions
                    ? 'Loading conversion options...'
                    : conversionOptions
                    ? `${conversionOptions.customEventNames.length} pixel events, ${conversionOptions.customConversions.length} custom conversions`
                    : 'No conversion events loaded yet.'}
                  {conversionOptions && conversionOptions.customEventNames.length === 0 && formData.pixelId && (
                    <span className="block mt-1 text-yellow-400/60">
                      No pixel events detected yet. Send a test event (SmartLinkOutbound) then refresh.
                    </span>
                  )}
                </p>
                {pixelDebugInfo && formData.pixelId && (
                  <details className="mt-2 text-[10px] text-white/30">
                    <summary className="cursor-pointer hover:text-white/50 font-medium">
                      Custom Conversions Debug Info
                    </summary>
                    <div className="mt-2 p-3 bg-gray-800/50 rounded border border-gray-700">
                      <div className="space-y-1 font-mono">
                        <div><span className="text-white/50">Ad Account Used:</span> {pixelDebugInfo.adAccountIdUsed || 'none'}</div>
                        <div><span className="text-white/50">Pixel Filter:</span> {pixelDebugInfo.pixelIdFilter || 'all'}</div>
                        <div><span className="text-white/50">Total Fetched:</span> {pixelDebugInfo.totalFetched || 0}</div>
                        <div><span className="text-white/50">Total Returned:</span> {pixelDebugInfo.totalReturned || 0}</div>
                        {pixelDebugInfo.totalFetched > 0 && pixelDebugInfo.totalReturned === 0 && (
                          <div className="mt-2 text-yellow-500">
                            ⚠️ Conversions found but none match this pixel. They may be in a different ad account.
                          </div>
                        )}
                        {pixelDebugInfo.sample && pixelDebugInfo.sample.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer hover:text-white/50">Sample Data</summary>
                            <pre className="mt-1 text-[9px] overflow-auto max-h-32">
                              {JSON.stringify(pixelDebugInfo.sample, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </details>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {formData.campaignType === 'smart_link_campaign' ? 'Lifetime Budget (USD) *' : 'Daily Budget (USD) *'}
                </label>
                <input
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  min="1"
                  step="0.01"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.campaignType === 'smart_link_campaign'
                    ? 'Total budget to spend over the campaign lifetime. You can add more funds later without restarting.'
                    : 'Amount to spend per day. Meta will pace your spend throughout the day.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Link to Smart Link (Optional)</label>
                <StyledSelect
                  value={formData.smartLinkId}
                  onChange={(value) => setFormData({ ...formData, smartLinkId: value })}
                  options={[
                    { value: '', label: 'No Smart Link' },
                    ...smartLinks.map((link) => ({
                      value: link.id,
                      label: link.title,
                    })),
                  ]}
                  placeholder="No Smart Link"
                />
              </div>

              {formData.campaignType === 'smart_link_campaign' ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Genres (Recommended)</label>
                  <p className="text-xs text-slate-500 mb-3">
                    Pick 1–5 genres. Keep it broad — Meta will optimize delivery. No artist targeting needed.
                  </p>

                  {/* Genre Multi-Select */}
                  <div className="mb-3">
                    <details className="border border-slate-700 rounded-lg">
                      <summary className="px-4 py-3 cursor-pointer bg-slate-950 hover:bg-slate-900 rounded-lg flex items-center justify-between">
                        <span className="text-sm text-slate-300">
                          {formData.targetingGenres.length === 0
                            ? 'Select Genres'
                            : `${formData.targetingGenres.length} genre${formData.targetingGenres.length > 1 ? 's' : ''} selected`}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formData.targetingGenres.length > 0 && `(Max 5)`}
                        </span>
                      </summary>
                      <div className="p-4 bg-slate-950 rounded-b-lg max-h-60 overflow-y-auto">
                        {GENRE_OPTIONS.map((genre) => {
                          const isSelected = formData.targetingGenres.includes(genre);
                          const isDisabled = !isSelected && formData.targetingGenres.length >= 5;
                          return (
                            <label
                              key={genre}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                                  : isDisabled
                                  ? 'opacity-40 cursor-not-allowed'
                                  : 'hover:bg-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isDisabled}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      targetingGenres: [...formData.targetingGenres, genre],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      targetingGenres: formData.targetingGenres.filter((g) => g !== genre),
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                              />
                              <span className="text-sm text-slate-200">{genre}</span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  </div>

                  {/* Selected Genres Pills */}
                  {formData.targetingGenres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {formData.targetingGenres.map((genre) => (
                        <span
                          key={genre}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-full"
                        >
                          {genre}
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                targetingGenres: formData.targetingGenres.filter((g) => g !== genre),
                              });
                            }}
                            className="ml-1 hover:text-emerald-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Broad Targeting Toggle */}
                  <label className="flex items-center gap-2 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.targetingBroad}
                      onChange={(e) => setFormData({ ...formData, targetingBroad: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-300">Broad targeting (recommended)</span>
                    <span className="text-xs text-slate-500">— Meta will expand reach for better results</span>
                  </label>

                  {/* Resolved Interests Preview */}
                  {resolvingGenres && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Resolving interests...</span>
                    </div>
                  )}

                  {!resolvingGenres && resolvedInterests.length > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 mb-2">
                      <p className="text-xs font-medium text-emerald-300 mb-1">
                        Resolved {resolvedInterests.length} interest{resolvedInterests.length > 1 ? 's' : ''}:
                      </p>
                      <p className="text-xs text-emerald-400/70">
                        {resolvedInterests.map((i) => i.name).join(', ')}
                      </p>
                    </div>
                  )}

                  {!resolvingGenres && unresolvedGenres.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 mb-2">
                      <p className="text-xs font-medium text-amber-300 mb-1">
                        Couldn't match: {unresolvedGenres.join(', ')}
                      </p>
                      <p className="text-xs text-amber-400/70">
                        Campaign will run broad for these genres.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">Targeting (Optional)</label>
                  <textarea
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder:text-slate-500"
                    value={formData.targetingTerms}
                    onChange={(e) => setFormData({ ...formData, targetingTerms: e.target.value })}
                    rows={3}
                    placeholder="Enter artists, genres, or interests (comma-separated)&#10;Example: Drake, Hip Hop, Rap Music, Travis Scott"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    We'll match these to Meta's interest targeting options. Invalid terms are silently skipped.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Ad Creatives (Images & Videos) *</label>
                <p className="text-sm text-gray-400 mb-4">
                  Upload up to 5 creatives for A/B testing. We'll create separate ads for each creative so you can see which one performs best. For example, if Creative 2 and 4 are winning, you can pause 1, 3, and 5.
                </p>
                <div className="space-y-4">
                  {creatives.map((creative) => (
                    <CreativeUploadSlot
                      key={creative.index}
                      creative={creative}
                      userId={user?.id || ''}
                      campaignTempId={Date.now().toString()}
                      onChange={(updated) => handleCreativeChange(creative.index, updated)}
                      onError={handleCreativeError}
                    />
                  ))}
                </div>
              </div>

              {/* Preview Section */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white/80">Preview Creatives</h3>
                  <p className="text-[11px] text-white/40">
                    Make sure each creative looks good before launching your campaign.
                  </p>
                </div>
                {uploadedCreatives.length === 0 ? (
                  <p className="text-xs text-white/35">
                    Upload at least one creative above to see a preview here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {uploadedCreatives.map((creative) => {
                      const isVideoFile =
                        (creative.fileType && creative.fileType.startsWith('video/')) ||
                        /\.(mp4|mov|webm)$/i.test(creative.publicUrl ?? '');

                      return (
                        <div
                          key={creative.index}
                          className="rounded-2xl border border-white/8 bg-[#050712]/90 p-3 shadow-md shadow-blue-900/40"
                        >
                          <div className="mb-2 flex items-center justify-between text-[11px] text-white/60">
                            <span className="font-medium">Creative {creative.index}</span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                              {isVideoFile ? 'Video' : 'Image'}
                            </span>
                          </div>

                          {isVideoFile ? (
                            <video
                              src={creative.publicUrl}
                              controls
                              className="h-40 w-full rounded-xl bg-black object-cover"
                            />
                          ) : (
                            <img
                              src={creative.publicUrl}
                              alt={`Creative ${creative.index}`}
                              className="h-40 w-full rounded-xl bg-black object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h3 className="text-sm font-semibold text-purple-100">Ghoste AI Ad Copy</h3>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3">Let AI write high-converting ad copy for you</p>
                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Ad Copy with AI
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Headline *</label>
                <input
                  type="text"
                  value={formData.headline}
                  onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  placeholder="Get main heading here"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Primary Text *</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  rows={3}
                  placeholder="Main ad copy that appears above the image"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  rows={2}
                  placeholder="Additional description text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Target Countries *</label>
                <CountryMultiSelect
                  selectedCodes={selectedCountryCodes}
                  onChange={setSelectedCountryCodes}
                />
              </div>

              {/* Placements Section */}
              <div>
                <h3 className="text-sm font-semibold text-white/85 mb-1">Placements</h3>
                <p className="text-xs text-white/45 mb-3">
                  Choose where your ads can appear on Facebook and Instagram. Automatic placements help maximize results.
                </p>

                {/* Instagram Missing Warning */}
                {!hasInstagramActorId && (
                  <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-xs text-amber-400">
                      ⚠️ Instagram not connected — this campaign will run on <strong>Facebook only</strong>.
                    </p>
                    <p className="text-xs text-amber-400/60 mt-1">
                      To enable Instagram placements, link an Instagram Business Account to your Facebook Page.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setPlacementMode('automatic')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      placementMode === 'automatic'
                        ? 'bg-blue-500 text-white shadow shadow-blue-500/60'
                        : 'bg-white/5 text-white/65 hover:bg-white/10'
                    }`}
                  >
                    Automatic placements (recommended)
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlacementMode('manual')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      placementMode === 'manual'
                        ? 'bg-blue-500 text-white shadow shadow-blue-500/60'
                        : 'bg-white/5 text-white/65 hover:bg-white/10'
                    }`}
                  >
                    Manual placements
                  </button>
                </div>

                {placementMode === 'manual' && (
                  <div className="rounded-2xl border border-white/10 bg-[#050712]/90 p-3">
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {PLACEMENT_GROUPS.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setPlacementTab(g.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            placementTab === g.id
                              ? 'bg-blue-500 text-white shadow shadow-blue-500/60'
                              : 'bg-white/5 text-white/65 hover:bg-white/10'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {PLACEMENT_OPTIONS.filter((p) => p.group === placementTab).map((p) => {
                        const list =
                          p.platform === 'facebook'
                            ? selectedFacebookPositions
                            : selectedInstagramPositions;

                        const setList =
                          p.platform === 'facebook'
                            ? setSelectedFacebookPositions
                            : setSelectedInstagramPositions;

                        const checked = list.includes(p.id);

                        return (
                          <label
                            key={`${p.platform}-${p.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors"
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-white/40 bg-transparent text-blue-500"
                              checked={checked}
                              onChange={() => {
                                setList((prev) =>
                                  checked
                                    ? prev.filter((v) => v !== p.id)
                                    : [...prev, p.id]
                                );
                              }}
                            />
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-500/70" />
                              <span>
                                {p.platform === 'facebook' ? 'Facebook · ' : 'Instagram · '}
                                {p.label}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-slate-400">Campaign launch cost:</span>
                  <CreditCostBadge featureKey="meta_launch_campaign" />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting || isSpending}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    {isSpending ? 'Reserving credits...' : submitting ? 'Creating Ad...' : 'Create Ad on Meta'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, { saveAsDraft: true })}
                    disabled={submitting || isSpending}
                    className="px-6 py-3 bg-slate-600 hover:bg-slate-700 disabled:bg-gray-700 rounded-lg font-semibold whitespace-nowrap"
                    title="Save configuration without launching on Meta"
                  >
                    {submitting ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={submitting}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-slate-500 text-center">
                  Save Draft is free and doesn't require credits. Launch when you're ready!
                </p>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Preview Modal */}
      {previewCreative && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl mx-4 rounded-2xl bg-gray-900 p-6 shadow-2xl border border-gray-700">
            <button
              type="button"
              onClick={closePreview}
              className="absolute right-4 top-4 rounded-full bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-sm text-white transition-colors z-10"
            >
              Close
            </button>

            <div className="mb-4 text-sm font-medium text-gray-300">
              Preview – Creative {previewCreative.index}
            </div>

            <div className="flex items-center justify-center">
              {isVideo(previewCreative) ? (
                <video
                  src={previewCreative.publicUrl ?? ''}
                  controls
                  autoPlay
                  className="max-h-[75vh] w-full rounded-xl bg-black object-contain"
                />
              ) : (
                <img
                  src={previewCreative.publicUrl ?? ''}
                  alt={`Creative ${previewCreative.index}`}
                  className="max-h-[75vh] w-full rounded-xl bg-black object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-purple-700/50 p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Generate Ad Copy with AI</h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Goal *</label>
                <select
                  value={aiInputs.goal}
                  onChange={(e) => setAiInputs({ ...aiInputs, goal: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  required
                >
                  <option value="">Select goal</option>
                  <option value="promote single">Promote single</option>
                  <option value="promote album">Promote album</option>
                  <option value="grow email list">Grow email list</option>
                  <option value="presave campaign">Pre-save campaign</option>
                  <option value="drive streams">Drive streams</option>
                  <option value="get show tickets">Get show tickets</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Offer *</label>
                <input
                  type="text"
                  value={aiInputs.offer}
                  onChange={(e) => setAiInputs({ ...aiInputs, offer: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="e.g., New single out now, Free preset pack"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Audience</label>
                <input
                  type="text"
                  value={aiInputs.target_audience}
                  onChange={(e) => setAiInputs({ ...aiInputs, target_audience: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="e.g., Hip-hop fans, EDM lovers"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tone</label>
                <select
                  value={aiInputs.tone}
                  onChange={(e) => setAiInputs({ ...aiInputs, tone: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="energetic">Energetic</option>
                  <option value="emotional">Emotional</option>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="hype">Hype</option>
                  <option value="authentic">Authentic</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  disabled={aiGenerating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAiCopy}
                  disabled={aiGenerating || !aiInputs.goal || !aiInputs.offer}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meta Event Logs Panel */}
      <div className="mt-8">
        <MetaEventLogsPanel />
      </div>
    </div>
    </ProGate>
  );
}
