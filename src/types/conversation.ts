export type GhosteMessageRole = 'user' | 'assistant' | 'system';

export interface GhosteMessage {
  id: string;
  role: GhosteMessageRole;
  content: string;
  created_at: string;
}

export interface GhosteConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  is_archived: boolean;
  messages?: GhosteMessage[];
}
