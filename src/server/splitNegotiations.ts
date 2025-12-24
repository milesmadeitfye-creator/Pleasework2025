import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export type SplitNegotiationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'countered'
  | 'completed';

export type SplitNegotiationRecord = {
  id: string;
  user_id: string;
  public_token: string;
  song_title: string;
  primary_artist: string;
  recipient_email: string | null;
  recipient_name: string | null;
  status: SplitNegotiationStatus;
  proposed_split: number | null;
  role: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function createSplitNegotiation(args: {
  userId: string;
  songTitle: string;
  primaryArtist: string;
  recipientEmail: string;
  recipientName?: string;
  proposedSplit?: number;
  role?: string;
  notes?: string;
}): Promise<SplitNegotiationRecord> {
  const {
    userId,
    songTitle,
    primaryArtist,
    recipientEmail,
    recipientName,
    proposedSplit,
    role,
    notes,
  } = args;

  const { data, error } = await supabaseAdmin
    .from('split_negotiations')
    .insert({
      user_id: userId,
      song_title: songTitle,
      primary_artist: primaryArtist,
      recipient_email: recipientEmail,
      recipient_name: recipientName ?? null,
      proposed_split: proposedSplit ?? null,
      role: role ?? null,
      notes: notes ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[splitNegotiations] createSplitNegotiation error', error);
    throw new Error('Failed to create split negotiation');
  }

  return data as SplitNegotiationRecord;
}

export async function listOpenSplitNegotiationsForUser(args: {
  userId: string;
  limit?: number;
}): Promise<SplitNegotiationRecord[]> {
  const { userId, limit = 20 } = args;

  const { data, error } = await supabaseAdmin
    .from('split_negotiations')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'countered'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[splitNegotiations] listOpenSplitNegotiationsForUser error', error);
    throw new Error('Failed to list split negotiations');
  }

  return data as SplitNegotiationRecord[];
}
