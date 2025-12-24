import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export type FanCampaignRecord = {
  id: string;
  user_id: string;
  channel: string;
  subject: string | null;
  message: string | null;
  body_html: string | null;
  status: string | null;
  recipient_count: number | null;
  created_at: string;
  updated_at: string;
};

export async function createAndSendFanCampaign(args: {
  userId: string;
  subject: string;
  bodyHtml: string;
  channel?: string;
}): Promise<FanCampaignRecord> {
  const {
    userId,
    subject,
    bodyHtml,
    channel = 'mailchimp_email',
  } = args;

  const { data: campaign, error } = await supabaseAdmin
    .from('fan_messages')
    .insert({
      user_id: userId,
      channel,
      subject,
      body_html: bodyHtml,
      message: bodyHtml,
      status: 'queued',
      recipient_count: 0,
    })
    .select('*')
    .single();

  if (error || !campaign) {
    console.error('[fanCommunication] createAndSendFanCampaign error', error);
    throw new Error('Failed to create fan campaign');
  }

  return campaign as FanCampaignRecord;
}

export async function listRecentFanCampaigns(args: {
  userId: string;
  limit?: number;
}): Promise<FanCampaignRecord[]> {
  const { userId, limit = 20 } = args;

  const { data, error } = await supabaseAdmin
    .from('fan_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[fanCommunication] listRecentFanCampaigns error', error);
    throw new Error('Failed to list fan campaigns');
  }

  return data as FanCampaignRecord[];
}
