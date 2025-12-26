export type GhosteMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface GhosteMessage {
  id: string;
  conversation_id?: string;
  user_id?: string;
  role: GhosteMessageRole;
  content: string;
  meta?: Record<string, unknown>;
  created_at: string;
  attachments?: Array<{
    url: string;
    fileName: string;
    type: string;
    size?: number;
  }>;
}

export interface GhosteConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages?: GhosteMessage[];
}
