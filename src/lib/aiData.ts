import { supabase } from './supabase';

export interface UserAggregateData {
  trackCount: number;
  linkCount: number;
  totalClicks: number;
  presaveCount: number;
  topPlatforms: string[];
  metaConnected: boolean;
}

export interface LookalikeAudience {
  name: string;
  countries: string[];
  interests: string[];
  ageRange: string;
  estimatedReach: number;
}

export async function aggregateUserData(userId: string): Promise<UserAggregateData> {
  try {
    const [tracks, links, presaves, metaConn] = await Promise.all([
      supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
      supabase.from('links').select('*').eq('owner_id', userId),
      supabase.from('presave_actions').select('id', { count: 'exact', head: true }),
      supabase.from('meta_connections').select('id').eq('user_id', userId).maybeSingle()
    ]);

    const totalClicks = links.data?.reduce((sum, link) => sum + (link.clicks || 0), 0) || 0;

    return {
      trackCount: tracks.count || 0,
      linkCount: links.count || 0,
      totalClicks,
      presaveCount: presaves.count || 0,
      topPlatforms: ['Spotify', 'Apple Music', 'YouTube'],
      metaConnected: !!metaConn.data
    };
  } catch (error) {
    console.error('[aiData] Error aggregating user data:', error);
    return {
      trackCount: 0,
      linkCount: 0,
      totalClicks: 0,
      presaveCount: 0,
      topPlatforms: [],
      metaConnected: false
    };
  }
}

export async function suggestLookalikeAudiences(userId: string): Promise<LookalikeAudience[]> {
  console.log('[aiData] Generating lookalike suggestions for user:', userId);

  return [
    {
      name: 'Music Enthusiasts 18-34',
      countries: ['US', 'GB', 'CA'],
      interests: ['Alternative Rock', 'Indie Music', 'Music Festivals'],
      ageRange: '18-34',
      estimatedReach: 250000
    },
    {
      name: 'Concert Goers',
      countries: ['US', 'AU', 'DE'],
      interests: ['Live Music', 'Concerts', 'Music Venues'],
      ageRange: '21-45',
      estimatedReach: 180000
    },
    {
      name: 'Spotify Power Users',
      countries: ['US', 'GB', 'SE'],
      interests: ['Spotify', 'Music Streaming', 'Playlists'],
      ageRange: '18-44',
      estimatedReach: 300000
    }
  ];
}
