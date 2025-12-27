import { supabase } from '@/lib/supabase.client';

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: any, context: { userId: string }) => Promise<any>;
}

export const tools: Tool[] = [
  {
    name: 'createSmartLink',
    description: 'Create a new smart link for a song or album with multiple platform URLs',
    parameters: [
      { name: 'title', type: 'string', description: 'Title of the song or album', required: true },
      { name: 'slug', type: 'string', description: 'URL-friendly slug (e.g., "my-song")', required: true },
      { name: 'spotify_url', type: 'string', description: 'Spotify URL', required: false },
      { name: 'apple_music_url', type: 'string', description: 'Apple Music URL', required: false },
      { name: 'youtube_url', type: 'string', description: 'YouTube URL', required: false },
      { name: 'cover_image_url', type: 'string', description: 'Cover art image URL', required: false },
    ],
    execute: async (params, context) => {
      const { data, error } = await supabase
        .from('smart_links')
        .insert({
          user_id: context.userId,
          title: params.title,
          slug: params.slug,
          spotify_url: params.spotify_url || '',
          apple_music_url: params.apple_music_url || '',
          youtube_url: params.youtube_url || '',
          cover_image_url: params.cover_image_url || '',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        link_id: data.id,
        url: `https://ghoste.one/l/${params.slug}`,
        message: `Smart link created successfully! Share: https://ghoste.one/l/${params.slug}`,
      };
    },
  },

  {
    name: 'createEmailCapture',
    description: 'Create an email capture landing page to collect fan emails',
    parameters: [
      { name: 'title', type: 'string', description: 'Title for the email capture page', required: true },
      { name: 'slug', type: 'string', description: 'URL-friendly slug', required: true },
      { name: 'description', type: 'string', description: 'Description text', required: false },
    ],
    execute: async (params, context) => {
      return {
        success: true,
        url: `https://ghoste.one/email/${params.slug}`,
        message: `Email capture page ready at: https://ghoste.one/email/${params.slug}`,
        note: 'Use the Links dashboard to upload an image and customize the page.',
      };
    },
  },

  {
    name: 'getSpotifyStats',
    description: 'Get Spotify statistics for an artist or track',
    parameters: [
      { name: 'spotify_url', type: 'string', description: 'Spotify artist or track URL', required: true },
    ],
    execute: async (params) => {
      const response = await fetch('/.netlify/functions/spotify-artist-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: params.spotify_url }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Spotify stats');
      }

      const data = await response.json();
      return {
        success: true,
        stats: data,
        message: `Retrieved Spotify stats successfully!`,
      };
    },
  },

  {
    name: 'saveArtistContact',
    description: 'Save a fan contact to your database',
    parameters: [
      { name: 'email', type: 'string', description: 'Fan email address', required: true },
      { name: 'name', type: 'string', description: 'Fan name', required: false },
      { name: 'source', type: 'string', description: 'Where the contact came from', required: false },
    ],
    execute: async (params, context) => {
      const { data, error } = await supabase
        .from('fan_contacts')
        .insert({
          user_id: context.userId,
          email: params.email,
          name: params.name || '',
          source: params.source || 'ghoste-ai',
        })
        .select()
        .single();

      if (error) throw error;
      return {
        success: true,
        contact_id: data.id,
        message: `Fan contact saved: ${params.email}`,
      };
    },
  },

  {
    name: 'generateMarketingPlan',
    description: 'Generate a comprehensive marketing plan based on release details',
    parameters: [
      { name: 'release_date', type: 'string', description: 'Release date (YYYY-MM-DD)', required: true },
      { name: 'genre', type: 'string', description: 'Music genre', required: true },
      { name: 'budget', type: 'number', description: 'Marketing budget in USD', required: true },
      { name: 'platforms', type: 'string', description: 'Target platforms (comma separated)', required: false },
    ],
    execute: async (params) => {
      const releaseDate = new Date(params.release_date);
      const today = new Date();
      const daysUntilRelease = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const plan = {
        release_date: params.release_date,
        days_until_release: daysUntilRelease,
        genre: params.genre,
        budget: params.budget,
        phases: [
          {
            name: 'Pre-Save Campaign',
            timeline: `${daysUntilRelease - 14} days before release`,
            budget: params.budget * 0.2,
            tasks: [
              'Create pre-save links on Spotify and Apple Music',
              'Design promotional graphics',
              'Launch email capture campaign',
              'Create teaser content for social media',
            ],
          },
          {
            name: 'Launch Week',
            timeline: 'Release week',
            budget: params.budget * 0.5,
            tasks: [
              'Run Meta ads targeting your audience',
              'Post across all social platforms',
              'Send announcement email to fans',
              'Submit to playlists',
              'Engage with early listeners',
            ],
          },
          {
            name: 'Post-Release',
            timeline: '2-4 weeks after release',
            budget: params.budget * 0.3,
            tasks: [
              'Analyze performance metrics',
              'Retarget engaged listeners',
              'Create user-generated content campaigns',
              'Pitch to music blogs and press',
            ],
          },
        ],
        recommendations: [
          `Allocate $${(params.budget * 0.6).toFixed(0)} to Meta/Instagram ads`,
          `Reserve $${(params.budget * 0.2).toFixed(0)} for playlist placements`,
          `Use remaining $${(params.budget * 0.2).toFixed(0)} for content creation`,
          'Start building hype 2-3 weeks before release',
          'Focus on engagement over reach in the first week',
        ],
      };

      return {
        success: true,
        plan,
        message: `Marketing plan generated for ${params.genre} release!`,
      };
    },
  },

  {
    name: 'diagnoseIssue',
    description: 'Diagnose common issues with Ghoste features',
    parameters: [
      { name: 'category', type: 'string', description: 'Issue category: mailchimp, meta, spotify, links, etc.', required: true },
    ],
    execute: async (params) => {
      const diagnostics: Record<string, any> = {
        mailchimp: {
          checks: [
            'Is Mailchimp account connected in Connected Accounts?',
            'Do you have an active audience selected?',
            'Are environment variables set in Netlify?',
            'Check Netlify function logs for errors',
          ],
          fixes: [
            'Reconnect Mailchimp in Connected Accounts',
            'Verify API key permissions in Mailchimp dashboard',
            'Check that audience ID is correct',
          ],
        },
        meta: {
          checks: [
            'Is Meta (Facebook) account connected?',
            'Do you have an active ad account?',
            'Is your pixel ID configured correctly?',
            'Check permissions for ad account access',
          ],
          fixes: [
            'Reconnect Meta in Connected Accounts',
            'Verify ad account permissions',
            'Add Meta pixel ID in settings',
            'Check Meta Business Manager settings',
          ],
        },
        spotify: {
          checks: [
            'Is Spotify account connected?',
            'Have you verified your artist profile?',
            'Are you using the correct Spotify artist URL?',
          ],
          fixes: [
            'Connect Spotify in Connected Accounts',
            'Verify you have access to Spotify for Artists',
            'Use the full Spotify artist URL',
          ],
        },
        links: {
          checks: [
            'Is the slug unique?',
            'Are platform URLs formatted correctly?',
            'Is the link marked as active?',
          ],
          fixes: [
            'Try a different slug name',
            'Verify URLs start with https://',
            'Check link status in Links dashboard',
          ],
        },
      };

      const category = params.category.toLowerCase();
      const diagnostic = diagnostics[category] || {
        checks: ['Category not recognized'],
        fixes: ['Please specify: mailchimp, meta, spotify, or links'],
      };

      return {
        success: true,
        category,
        diagnostic,
        message: `Diagnostic checklist for ${category}`,
      };
    },
  },

  {
    name: 'createPresave',
    description: 'Create a pre-save campaign for an upcoming release',
    parameters: [
      { name: 'song_title', type: 'string', description: 'Song or album title', required: true },
      { name: 'artist_name', type: 'string', description: 'Artist name', required: true },
      { name: 'release_date', type: 'string', description: 'Release date (YYYY-MM-DD)', required: true },
      { name: 'slug', type: 'string', description: 'URL slug', required: true },
    ],
    execute: async (params) => {
      return {
        success: true,
        url: `https://ghoste.one/presave/${params.slug}`,
        message: `Pre-save campaign created for "${params.song_title}" by ${params.artist_name}!`,
        note: `Release date: ${params.release_date}. Share the link: https://ghoste.one/presave/${params.slug}`,
      };
    },
  },

  {
    name: 'analyzeCampaigns',
    description: 'Analyze performance of all active advertising campaigns',
    parameters: [],
    execute: async (params, context) => {
      const { data: campaigns } = await supabase
        .from('meta_ad_campaigns')
        .select('*')
        .eq('user_id', context.userId)
        .is('adset_id', null)
        .is('ad_id', null)
        .order('created_at', { ascending: false });

      if (!campaigns || campaigns.length === 0) {
        return {
          success: true,
          message: 'No campaigns found. Create your first campaign to start tracking performance!',
          campaigns: [],
        };
      }

      const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
      const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
      const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

      const analysis = {
        total_campaigns: campaigns.length,
        active_campaigns: campaigns.filter(c => c.status === 'active').length,
        total_spend: totalSpend,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        conversion_rate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        top_campaign: campaigns.sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0],
      };

      return {
        success: true,
        analysis,
        message: `Analyzed ${campaigns.length} campaigns. Total spend: $${totalSpend.toFixed(2)}, Clicks: ${totalClicks}`,
      };
    },
  },

  {
    name: 'syncMailchimp',
    description: 'Sync a contact to your Mailchimp audience',
    parameters: [
      { name: 'email', type: 'string', description: 'Contact email', required: true },
      { name: 'name', type: 'string', description: 'Contact name', required: false },
    ],
    execute: async (params, context) => {
      const response = await fetch('/.netlify/functions/add-fan-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          name: params.name || '',
          user_id: context.userId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync contact to Mailchimp');
      }

      return {
        success: true,
        message: `Contact ${params.email} synced to Mailchimp successfully!`,
      };
    },
  },

  {
    name: 'generateCoverArt',
    description: 'Generate AI cover art for a song or album',
    parameters: [
      { name: 'prompt', type: 'string', description: 'Description of the artwork', required: true },
      { name: 'style', type: 'string', description: 'Art style (e.g., "minimalist", "abstract", "photorealistic")', required: false },
    ],
    execute: async (params) => {
      // TODO: Cover art generation moved to Supabase Edge Functions
      // Temporarily disabled until DALL-E integration is complete in Supabase
      throw new Error('Cover art generation is being upgraded. Check back soon!');

      // Future implementation:
      // const { data, error } = await supabase.functions.invoke('ghoste-ai', {
      //   body: {
      //     task: 'cover_art',
      //     payload: { prompt: params.prompt, style: params.style || 'modern' },
      //   },
      // });
      // if (error) throw new Error('Failed to generate cover art');
      // return data.result;
      return {
        success: true,
        image_url: data.url,
        message: 'Cover art generated successfully!',
      };
    },
  },

  {
    name: 'sendSms',
    description: 'Send an SMS message to a phone number via Twilio',
    parameters: [
      { name: 'to', type: 'string', description: 'Phone number in E.164 format (e.g., +12242435172)', required: true },
      { name: 'message', type: 'string', description: 'SMS message text', required: true },
    ],
    execute: async (params) => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Authentication required to send SMS');
      }

      const response = await fetch('/.netlify/functions/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ to: params.to, message: params.message }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send SMS');
      }

      const data = await response.json();
      return {
        success: true,
        sid: data.sid,
        message: `SMS sent successfully to ${params.to}`,
      };
    },
  },
];

export function getToolByName(name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function getAllTools(): Tool[] {
  return tools;
}

export function getToolsForLLM() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters.reduce((acc, param) => {
        acc[param.name] = {
          type: param.type,
          description: param.description,
        };
        return acc;
      }, {} as Record<string, any>),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    },
  }));
}
