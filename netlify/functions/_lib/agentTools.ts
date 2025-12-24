export type ToolDef = {
  name: string;
  description: string;
  inputSchema: any;
  category: 'calendar' | 'ads' | 'links' | 'content' | 'social' | 'splits' | 'analytics';
};

export const TOOL_DEFS: ToolDef[] = [
  // === CALENDAR TOOLS ===
  {
    name: 'schedule_events',
    description: 'Schedule one or more events on the user\'s calendar. Use this when the user asks to add tasks, events, or content to their schedule.',
    category: 'calendar',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              start_time: { type: 'string', description: 'ISO 8601 datetime' },
              end_time: { type: 'string' },
              category: { type: 'string', enum: ['content', 'release', 'ads', 'tour', 'admin', 'promo', 'meeting'] }
            },
            required: ['title', 'start_time']
          }
        }
      },
      required: ['events']
    }
  },

  // === SMART LINKS TOOLS ===
  {
    name: 'smartlink_create',
    description: 'Create a new Smart Link for a track/artist that aggregates multiple streaming platforms and return the public URL.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Link title, e.g. "My New Single"' },
        spotify_url: { type: 'string' },
        apple_music_url: { type: 'string' },
        youtube_url: { type: 'string' },
        tidal_url: { type: 'string' },
        soundcloud_url: { type: 'string' },
        button_label: { type: 'string' },
        button_url: { type: 'string' },
        template: { type: 'string', description: 'Modern, Minimal, Gradient, or Dark' }
      },
      required: ['title']
    }
  },
  {
    name: 'oneclick_create',
    description: 'Create a simple redirect link that sends fans directly to a single destination URL.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        target_url: { type: 'string', description: 'The destination URL' },
        slug: { type: 'string' }
      },
      required: ['title', 'target_url']
    }
  },
  {
    name: 'presave_create',
    description: 'Create a pre-save campaign for Spotify/Apple Music and return the public URL.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        release_date: { type: 'string', description: 'ISO format YYYY-MM-DD' },
        spotify_artist_url: { type: 'string' },
        spotify_track_url: { type: 'string' },
        apple_music_url: { type: 'string' },
        cover_image_url: { type: 'string' },
        slug: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'email_capture_create',
    description: 'Create an email capture landing page and return the public URL.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        redirect_url: { type: 'string' },
        slug: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'listening_party_create',
    description: 'Create a live listening party link for fans to listen together at a scheduled time.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        spotify_url: { type: 'string' },
        start_time: { type: 'string' },
        public_url: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'list_links',
    description: 'List all existing links so you can show the user what they have.',
    category: 'links',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // === META ADS TOOLS ===
  {
    name: 'meta_ads_draft',
    description: 'Create a Meta ads draft (campaign/adset/ad) from a brief and save it without spending.',
    category: 'ads',
    inputSchema: {
      type: 'object',
      properties: {
        campaigns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              objective: { type: 'string', description: 'OUTCOME_TRAFFIC, LINK_CLICKS, etc.' },
              daily_budget: { type: 'number', description: 'Budget in cents (1000 = $10)' },
              ad_account_id: { type: 'string' },
              pixel_id: { type: 'string' },
              page_id: { type: 'string' },
              instagram_id: { type: 'string' },
              link_url: { type: 'string' },
              headline: { type: 'string' },
              primary_text: { type: 'string' },
              targeting_countries: { type: 'array', items: { type: 'string' } },
              targeting_terms: { type: 'array', items: { type: 'string' } },
              placement_mode: { type: 'string', enum: ['automatic', 'manual'] },
              creatives_config: { type: 'array' }
            },
            required: ['name', 'objective', 'daily_budget', 'ad_account_id', 'pixel_id', 'link_url', 'headline', 'primary_text', 'targeting_countries']
          }
        }
      },
      required: ['campaigns']
    }
  },
  {
    name: 'meta_ads_publish',
    description: 'Publish saved Meta ads drafts to launch campaigns (real spend).',
    category: 'ads',
    inputSchema: {
      type: 'object',
      properties: {
        draft_ids: { type: 'array', items: { type: 'string' }, description: 'Array of draft campaign IDs' }
      },
      required: ['draft_ids']
    }
  },
  {
    name: 'meta_ads_list',
    description: 'List all Meta ad campaigns to show the user what campaigns exist.',
    category: 'ads',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'meta_ads_toggle',
    description: 'Pause or resume a Meta ad campaign.',
    category: 'ads',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] }
      },
      required: ['campaign_id', 'status']
    }
  },
  {
    name: 'get_ads_context',
    description: 'Fetch everything needed to suggest ads: artist profile, connected Meta assets, smart links, streaming stats. Call this FIRST before suggesting campaign setups.',
    category: 'ads',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // === SOCIAL MEDIA TOOLS ===
  {
    name: 'social_post_schedule',
    description: 'Schedule a social post across platforms (Instagram/Facebook/TikTok).',
    category: 'social',
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string' },
        media_urls: { type: 'array', items: { type: 'string' } },
        scheduled_at: { type: 'string', description: 'ISO datetime' },
        platforms: { type: 'array', items: { type: 'string' }, description: '["instagram", "facebook", "tiktok"]' }
      },
      required: ['caption']
    }
  },

  // === SPLIT SHEET TOOLS ===
  {
    name: 'split_create',
    description: 'Create a split agreement and invitations for collaborators.',
    category: 'splits',
    inputSchema: {
      type: 'object',
      properties: {
        song_title: { type: 'string' },
        participants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
              split_percentage: { type: 'number' },
              role: { type: 'string' }
            },
            required: ['email', 'split_percentage']
          }
        }
      },
      required: ['song_title', 'participants']
    }
  },

  // === ANALYTICS TOOLS ===
  {
    name: 'analytics_refresh',
    description: 'Refresh analytics for the user\'s active artist and store snapshots.',
    category: 'analytics',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force refresh ignoring cache' }
      }
    }
  },

  // === CONTENT TOOLS ===
  {
    name: 'cover_art_generate',
    description: 'Generate AI cover art using DALL-E and save it to user uploads.',
    category: 'content',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the cover art' },
        style: { type: 'string' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] },
        title: { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'list_media_assets',
    description: 'List uploaded media (videos, images, audio) to choose creatives for ads or links.',
    category: 'content',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results, default 5' },
        media_type: { type: 'string', enum: ['video', 'image', 'audio'] }
      }
    }
  }
];

export function getToolByName(name: string): ToolDef | undefined {
  return TOOL_DEFS.find(t => t.name === name);
}

export function getToolsByCategory(category: ToolDef['category']): ToolDef[] {
  return TOOL_DEFS.filter(t => t.category === category);
}
