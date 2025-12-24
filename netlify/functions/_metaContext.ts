import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type MetaContext = {
  userId: string;
  accessToken: string;
  businessId: string | null;
  primaryAdAccountId: string | null;
  primaryPageId: string | null;
  primaryInstagramId: string | null;
  primaryPixelId: string | null;
  conversionsApiToken: string | null;
  assets: {
    adAccounts: any[];
    pages: any[];
    instagramAccounts: any[];
    pixels: any[];
  };
};

export async function getMetaContextForUser(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<MetaContext | null> {
  console.log('[metaContext] Loading Meta context for user:', userId.substring(0, 8) + '...');

  const { data, error } = await supabaseAdmin
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[metaContext] Database error:', error);
    return null;
  }

  if (!data) {
    console.log('[metaContext] No active meta_credentials found for user');
    return null;
  }

  if (!data.access_token) {
    console.error('[metaContext] No access token in meta_credentials');
    return null;
  }

  const context: MetaContext = {
    userId,
    accessToken: data.access_token,
    businessId: data.business_id ?? null,
    primaryAdAccountId: data.ad_account_id ?? null,
    primaryPageId: data.facebook_page_id ?? null,
    primaryInstagramId: data.instagram_id ?? null,
    primaryPixelId: data.pixel_id ?? null,
    conversionsApiToken: data.conversion_api_token ?? null,
    assets: {
      adAccounts: (data.ad_accounts as any[]) ?? [],
      pages: (data.facebook_pages as any[]) ?? [],
      instagramAccounts: (data.instagram_accounts as any[]) ?? [],
      pixels: (data.pixels as any[]) ?? [],
    },
  };

  console.log('[metaContext] Meta context loaded:', {
    hasAccessToken: !!context.accessToken,
    businessId: context.businessId,
    primaryAdAccountId: context.primaryAdAccountId,
    primaryPageId: context.primaryPageId,
    primaryInstagramId: context.primaryInstagramId,
    primaryPixelId: context.primaryPixelId,
    adAccountsCount: context.assets.adAccounts.length,
    pagesCount: context.assets.pages.length,
    instagramAccountsCount: context.assets.instagramAccounts.length,
    pixelsCount: context.assets.pixels.length,
  });

  return context;
}

export function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.replace(/^act_/, '');
}

export function ensureAdAccountPrefix(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}
