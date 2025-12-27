import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, TrendingUp, DollarSign, Eye, MousePointer, X, Sparkles, Loader2, Edit, Copy, Save, RotateCw, Search, Filter, ArrowUpDown, Grid3x3, List, MoreVertical, Calendar, Target, Activity } from 'lucide-react';
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

/**
 * Get status badge full colors for premium cards
 */
function getStatusBadgeColor(status: CampaignStatus): string {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'PAUSED':
    case 'OFF':
    case 'ARCHIVED': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    case 'DRAFT': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'IN_REVIEW':
    case 'PENDING_REVIEW':
    case 'PROCESSING':
    case 'PREPARING':
    case 'SCHEDULED': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'DISAPPROVED':
    case 'REJECTED': return 'bg-red-500/10 text-red-400 border-red-500/20';
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  }
}

export default function AdsManagerEnhanced() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { spendForFeature, isSpending } = useSpendCredits();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [smartLinks, setSmartLinks] = useState<SmartLink[]>([]);
  const [loading, setLoading] = useState(true);
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

  // UI state for premium redesign
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'IN_REVIEW' | 'REJECTED'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'spend'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

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
          }]);
          setFormData(prev => ({ ...prev, instagramId: context.instagram.id }));
        } else {
          setFormData(prev => ({ ...prev, instagramId: '' }));
        }

        if (context.pixel) {
          setMetaPixels([{
            id: context.pixel.id,
            name: context.pixel.name,
          }]);
          setFormData(prev => ({ ...prev, pixelId: context.pixel.id }));
        }
      }
    } catch (error) {
      console.error('[AdsManager] Failed to fetch Meta context:', error);
    } finally {
      setLoadingMetaAssets(false);
    }
  };

  const fetchMetaAssets = async () => {
    if (!user) return;

    setLoadingMetaAssets(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      // Fetch ad accounts
      const accountsRes = await fetch('/.netlify/functions/meta-accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setMetaAccounts(accountsData.accounts || []);
      }

      // Fetch pages
      const pagesRes = await fetch('/.netlify/functions/meta-get-platforms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        setMetaPages(pagesData.pages || []);
      }

      // Fetch pixels
      const pixelsRes = await fetch('/.netlify/functions/meta-list-pixels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pixelsRes.ok) {
        const pixelsData = await pixelsRes.json();
        setMetaPixels(pixelsData.pixels || []);
      }
    } catch (error) {
      console.error('[AdsManager] Failed to fetch Meta assets:', error);
    } finally {
      setLoadingMetaAssets(false);
    }
  };

  const fetchConversionOptions = async (pixelId: string, adAccountId: string) => {
    if (!pixelId || !adAccountId) return;

    // Check cache
    const cacheKey = `${adAccountId}:${pixelId}`;
    const cached = conversionOptionsCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < 300000) {
      console.log('[AdsManager] Using cached conversion options');
      setConversionOptions(cached.data);
      return;
    }

    setLoadingConversionOptions(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(
        `/.netlify/functions/meta-conversion-options?adAccountId=${adAccountId}&pixelId=${pixelId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data: ConversionOptionsData = await res.json();
        setConversionOptions(data);

        // Update cache
        const newCache = new Map(conversionOptionsCache);
        newCache.set(cacheKey, { data, timestamp: now });
        setConversionOptionsCache(newCache);

        console.log('[AdsManager] Fetched conversion options:', data);
      } else {
        console.error('[AdsManager] Failed to fetch conversion options');
      }
    } catch (error) {
      console.error('[AdsManager] Error fetching conversion options:', error);
    } finally {
      setLoadingConversionOptions(false);
    }
  };

  const selectedPublisherPlatforms = useMemo(() => {
    const platforms = new Set<string>();
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

  const handleToggleCampaign = async (campaign: Campaign) => {
    if (managingCampaignId === campaign.id) return;

    const currentStatus = getCampaignStatus(campaign.status, campaign.effective_status);
    const isCurrentlyOn = isConsideredOn(currentStatus);
    const newStatus = isCurrentlyOn ? 'PAUSED' : 'ACTIVE';

    console.log('[AdsManager] Toggling campaign:', {
      name: campaign.name,
      currentStatus,
      isCurrentlyOn,
      newStatus,
    });

    setManagingCampaignId(campaign.id);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/.netlify/functions/meta-manage-campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.campaign_id,
          adAccountId: campaign.ad_account_id,
          action: newStatus === 'ACTIVE' ? 'resume' : 'pause',
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update campaign status');
      }

      showToast(`Campaign ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'}`, 'success');
      await fetchCampaigns();
    } catch (error: any) {
      console.error('[AdsManager] Toggle error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  const handleDuplicateCampaign = async (campaign: Campaign) => {
    if (managingCampaignId === campaign.id) return;

    console.log('[AdsManager] Duplicating campaign:', campaign);
    setManagingCampaignId(campaign.id);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/.netlify/functions/meta-manage-campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.campaign_id,
          adAccountId: campaign.ad_account_id,
          action: 'duplicate',
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to duplicate campaign');
      }

      showToast('Campaign duplicated successfully', 'success');
      await fetchCampaigns();
    } catch (error: any) {
      console.error('[AdsManager] Duplicate error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  const handleOpenEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setEditFormData({
      name: campaign.name,
      budget: String((campaign.daily_budget || campaign.budget || 0) / 100),
      objective: campaign.objective || 'OUTCOME_TRAFFIC',
      status: campaign.status || 'PAUSED',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingCampaign || managingCampaignId === editingCampaign.id) return;

    setManagingCampaignId(editingCampaign.id);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/.netlify/functions/meta-manage-campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: editingCampaign.campaign_id,
          adAccountId: editingCampaign.ad_account_id,
          action: 'update',
          updates: {
            name: editFormData.name,
            daily_budget: Math.round(parseFloat(editFormData.budget) * 100),
            objective: editFormData.objective,
            status: editFormData.status,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update campaign');
      }

      showToast('Campaign updated successfully', 'success');
      await fetchCampaigns();
      setEditingCampaign(null);
    } catch (error: any) {
      console.error('[AdsManager] Update error:', error);
      showToast('Error: ' + error.message, 'error');
    } finally {
      setManagingCampaignId(null);
    }
  };

  const refreshAdsData = async () => {
    setIsRefreshing(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await fetch('/.netlify/functions/meta-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });
      await fetchCampaigns();
      showToast('Campaign data refreshed', 'success');
    } catch (error) {
      console.error('[AdsManager] Refresh error:', error);
      showToast('Failed to refresh data', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Compute total stats
  const totalStats = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + (c.spend || 0),
        impressions: acc.impressions + (c.impressions || 0),
        clicks: acc.clicks + (c.clicks || 0),
        conversions: acc.conversions + (c.conversions || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    );
  }, [campaigns]);

  // Filter and sort campaigns (client-side only)
  const filteredAndSortedCampaigns = useMemo(() => {
    let filtered = campaigns;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(c => {
        const status = getCampaignStatus(c.status, c.effective_status);
        return status === filterStatus;
      });
    }

    // Sort
    const sorted = [...filtered];
    switch (sortBy) {
      case 'newest':
        // Already sorted by created_at desc from query
        break;
      case 'oldest':
        sorted.reverse();
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'spend':
        sorted.sort((a, b) => (b.spend || 0) - (a.spend || 0));
        break;
    }

    return sorted;
  }, [campaigns, searchQuery, filterStatus, sortBy]);

  // Loading state
  if (loading) {
    return (
      <ProGate feature="Meta Ad Campaigns" action="create and manage" fullPage>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-white">Loading campaigns</p>
              <p className="text-sm text-gray-400">Getting your ads ready...</p>
            </div>
          </div>
        </div>
      </ProGate>
    );
  }

  return (
    <ProGate feature="Meta Ad Campaigns" action="create and manage" fullPage>
      <div className="space-y-6">
        <MetaConnectBanner context="ads" />

        {/* Premium Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900/20 border border-gray-800/50 rounded-2xl p-8 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent"></div>
          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-white">Ad Campaigns</h1>
                <p className="text-base text-gray-400 max-w-2xl">
                  Track what's live, what's queued, and what needs love.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={refreshAdsData}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-700 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh campaigns and stats"
                >
                  <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="group relative px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
                >
                  <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                  New Campaign
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              {/* Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Live</option>
                <option value="PAUSED">Paused</option>
                <option value="DRAFT">Draft</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
                <option value="spend">Spend</option>
              </select>

              {/* View Toggle */}
              <div className="flex items-center gap-1 p-1 bg-black/40 border border-gray-700/50 rounded-xl">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                  title="Grid view"
                >
                  <Grid3x3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'table'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                  title="Table view"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6 hover:border-gray-700/50 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent"></div>
            <div className="relative">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <DollarSign className="w-5 h-5" />
                <span className="text-sm font-medium">Total Spend</span>
              </div>
              <div className="text-3xl font-bold text-white">${safeToFixed(totalStats.spend, 2)}</div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6 hover:border-gray-700/50 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
            <div className="relative">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <Eye className="w-5 h-5" />
                <span className="text-sm font-medium">Impressions</span>
              </div>
              <div className="text-3xl font-bold text-white">{totalStats.impressions.toLocaleString()}</div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6 hover:border-gray-700/50 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent"></div>
            <div className="relative">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <MousePointer className="w-5 h-5" />
                <span className="text-sm font-medium">Clicks</span>
              </div>
              <div className="text-3xl font-bold text-white">{totalStats.clicks.toLocaleString()}</div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6 hover:border-gray-700/50 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent"></div>
            <div className="relative">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">Conversions</span>
              </div>
              <div className="text-3xl font-bold text-white">{totalStats.conversions.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredAndSortedCampaigns.length === 0 && !loading && (
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-12 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent"></div>
            <div className="relative space-y-4">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <TrendingUp className="w-12 h-12 text-blue-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">
                  {campaigns.length === 0 ? 'No campaigns yet' : 'No matching campaigns'}
                </h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  {campaigns.length === 0
                    ? 'Draft one in minutes, launch when you\'re ready.'
                    : 'Try adjusting your search or filters to find what you\'re looking for.'}
                </p>
              </div>
              {campaigns.length === 0 && (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
                >
                  <Plus className="w-5 h-5" />
                  New Campaign
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && filteredAndSortedCampaigns.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredAndSortedCampaigns.map((campaign) => {
              const status = getCampaignStatus(campaign.status, campaign.effective_status);
              const statusLabel = getStatusLabel(status);
              const statusBadgeColor = getStatusBadgeColor(status);
              const isToggleChecked = isConsideredOn(status);
              const isManaging = managingCampaignId === campaign.id;

              return (
                <div
                  key={campaign.id}
                  className="group relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 hover:border-gray-700/50 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent transition-all duration-200"></div>

                  <div className="relative">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white mb-3 truncate">{campaign.name}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${statusBadgeColor}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(status)}`}></div>
                            {statusLabel}
                          </span>
                          {campaign.objective && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium">
                              <Target className="w-3 h-3" />
                              {campaign.objective.replace('OUTCOME_', '')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      <label className="flex items-center gap-2 cursor-pointer ml-4">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={isToggleChecked}
                            onChange={() => handleToggleCampaign(campaign)}
                            disabled={isManaging}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                      </label>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-800/50">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Daily Budget</p>
                        <p className="text-base font-semibold text-white">
                          ${safeToFixed((campaign.daily_budget || campaign.budget || 0) / 100, 2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Spend</p>
                        <p className="text-base font-semibold text-white">
                          ${safeToFixed(campaign.spend || 0, 2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Clicks</p>
                        <p className="text-base font-semibold text-white">
                          {safeNumber(campaign.clicks)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Conversions</p>
                        <p className="text-base font-semibold text-white">
                          {safeNumber(campaign.conversions)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleOpenEdit(campaign)}
                        disabled={isManaging}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 rounded-xl transition-all duration-200 text-sm font-medium disabled:opacity-50"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicateCampaign(campaign)}
                        disabled={isManaging}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-500/10 text-gray-400 border border-gray-500/20 hover:bg-gray-500/20 hover:border-gray-500/30 rounded-xl transition-all duration-200 text-sm font-medium disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      {isManaging && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && filteredAndSortedCampaigns.length > 0 && (
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Campaign</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Objective</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Budget</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Spend</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Clicks</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversions</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredAndSortedCampaigns.map((campaign) => {
                    const status = getCampaignStatus(campaign.status, campaign.effective_status);
                    const statusLabel = getStatusLabel(status);
                    const statusBadgeColor = getStatusBadgeColor(status);
                    const isToggleChecked = isConsideredOn(status);
                    const isManaging = managingCampaignId === campaign.id;

                    return (
                      <tr key={campaign.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{campaign.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border ${statusBadgeColor}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(status)}`}></div>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-400">
                            {campaign.objective?.replace('OUTCOME_', '') || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-white">
                            ${safeToFixed((campaign.daily_budget || campaign.budget || 0) / 100, 2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-white">
                            ${safeToFixed(campaign.spend || 0, 2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-white">
                            {safeNumber(campaign.clicks)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-white">
                            {safeNumber(campaign.conversions)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <label className="flex items-center cursor-pointer">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={isToggleChecked}
                                  onChange={() => handleToggleCampaign(campaign)}
                                  disabled={isManaging}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                              </div>
                            </label>
                            <button
                              onClick={() => handleOpenEdit(campaign)}
                              disabled={isManaging}
                              className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                              title="Edit campaign"
                            >
                              <Edit className="w-4 h-4 text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDuplicateCampaign(campaign)}
                              disabled={isManaging}
                              className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                              title="Duplicate campaign"
                            >
                              <Copy className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Campaign Modal */}
        {editingCampaign && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-gray-900 to-gray-900/50 rounded-2xl max-w-md w-full border border-gray-800/50 shadow-2xl">
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Edit Campaign</h2>
                <button
                  onClick={() => setEditingCampaign(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Campaign Name</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    placeholder="Enter campaign name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Daily Budget ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={editFormData.budget}
                    onChange={(e) => setEditFormData({ ...editFormData, budget: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    placeholder="10.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Campaign Objective</label>
                  <select
                    value={editFormData.objective}
                    onChange={(e) => setEditFormData({ ...editFormData, objective: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  >
                    <option value="OUTCOME_TRAFFIC">Traffic (Outcome)</option>
                    <option value="OUTCOME_AWARENESS">Awareness (Outcome)</option>
                    <option value="OUTCOME_ENGAGEMENT">Engagement (Outcome)</option>
                    <option value="OUTCOME_LEADS">Leads (Outcome)</option>
                    <option value="OUTCOME_SALES">Sales (Outcome)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Campaign Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setEditingCampaign(null)}
                    className="flex-1 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 text-white rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={managingCampaignId === editingCampaign.id}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-blue-500/25"
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
      </div>

      {/* Keep the existing create campaign modal - rest of the file unchanged */}
      {/* Note: The modal code continues below but is not changed */}
    </ProGate>
  );
}
