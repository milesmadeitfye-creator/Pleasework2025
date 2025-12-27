export type GhosteMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface GhosteMessageAttachment {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'file';
  filename: string;
  mime: string;
  size: number;
  url: string;
  duration?: number;
}

export interface GhosteMessage {
  id: string;
  conversation_id?: string;
  user_id?: string;
  role: GhosteMessageRole;
  content: string;
  meta?: Record<string, unknown>;
  created_at: string;
  attachments?: GhosteMessageAttachment[];
}

export interface GhosteConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages?: GhosteMessage[];
}
