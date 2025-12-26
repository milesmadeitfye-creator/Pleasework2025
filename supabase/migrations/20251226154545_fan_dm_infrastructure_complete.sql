/*
  # Fan DM Infrastructure + Templates, Broadcasts, Sequences

  ## Overview
  Complete ManyChat-style fan communication system with:
  - Base DM infrastructure (conversations, messages, tags, opt-ins, automations)
  - Templates with variables
  - Broadcasts for bulk messaging
  - Multi-step sequences

  ## New Tables

  ### Base DM Infrastructure
  1. fan_dm_conversations - Conversation threads with fans
  2. fan_dm_messages - Individual messages
  3. fan_dm_tags - Tags for organizing conversations
  4. fan_dm_conversation_tags - Many-to-many mapping
  5. fan_dm_opt_ins - GDPR compliance tracking
  6. fan_comms_events - Event log for DM tracking
  7. fan_dm_automations - Automation workflows
  8. fan_dm_automation_nodes - Workflow nodes
  9. fan_dm_automation_edges - Workflow connections
  10. fan_dm_automation_runs - Execution history

  ### Advanced Features
  11. fan_templates - Reusable message templates
  12. fan_sequences - Multi-step drip campaigns
  13. fan_sequence_steps - Individual sequence steps
  14. fan_sequence_enrollments - Track enrollments
  15. fan_broadcasts - Bulk messaging campaigns
  16. fan_broadcast_sends - Individual send tracking

  ## Security
  - RLS enabled on all tables
  - Policies restrict to owner_user_id = auth.uid()
*/

-- =====================================================
-- BASE DM INFRASTRUCTURE
-- =====================================================

-- 1. CONVERSATIONS
CREATE TABLE IF NOT EXISTS fan_dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  page_id text,
  ig_business_id text,
  platform_thread_id text,
  platform_user_id text,
  fan_psid text,
  fan_igid text,
  fan_name text,
  fan_username text,
  fan_profile_pic_url text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their conversations"
  ON fan_dm_conversations FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_conversations_owner ON fan_dm_conversations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_conversations_platform ON fan_dm_conversations(platform);
CREATE INDEX IF NOT EXISTS idx_fan_dm_conversations_updated ON fan_dm_conversations(updated_at DESC);

-- 2. MESSAGES
CREATE TABLE IF NOT EXISTS fan_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  platform_message_id text,
  message_type text DEFAULT 'text',
  text text,
  content text,
  payload jsonb DEFAULT '{}'::jsonb,
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their messages"
  ON fan_dm_messages FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_messages_owner ON fan_dm_messages(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_messages_conversation ON fan_dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_messages_sent ON fan_dm_messages(sent_at DESC);

-- 3. TAGS
CREATE TABLE IF NOT EXISTS fan_dm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their tags"
  ON fan_dm_tags FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_tags_owner ON fan_dm_tags(owner_user_id);

-- 4. CONVERSATION TAGS
CREATE TABLE IF NOT EXISTS fan_dm_conversation_tags (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES fan_dm_tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

ALTER TABLE fan_dm_conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage conversation tags"
  ON fan_dm_conversation_tags FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_conversation_tags_owner ON fan_dm_conversation_tags(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_conversation_tags_conversation ON fan_dm_conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_conversation_tags_tag ON fan_dm_conversation_tags(tag_id);

-- 5. OPT-INS
CREATE TABLE IF NOT EXISTS fan_dm_opt_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('24h', 'otn', 'recurring')),
  topic text,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  consumed boolean DEFAULT false
);

ALTER TABLE fan_dm_opt_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage opt-ins"
  ON fan_dm_opt_ins FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_opt_ins_owner ON fan_dm_opt_ins(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_opt_ins_conversation ON fan_dm_opt_ins(conversation_id);

-- 6. COMMS EVENTS
CREATE TABLE IF NOT EXISTS fan_comms_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  platform text,
  conversation_id uuid REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  message_id uuid,
  event_type text NOT NULL,
  event_ts timestamptz DEFAULT now(),
  meta jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE fan_comms_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their events"
  ON fan_comms_events FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_comms_events_owner ON fan_comms_events(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_comms_events_conversation ON fan_comms_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fan_comms_events_ts ON fan_comms_events(event_ts DESC);

-- 7. AUTOMATIONS
CREATE TABLE IF NOT EXISTS fan_dm_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  trigger_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage automations"
  ON fan_dm_automations FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_automations_owner ON fan_dm_automations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_automations_status ON fan_dm_automations(status);

-- 8. AUTOMATION NODES
CREATE TABLE IF NOT EXISTS fan_dm_automation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES fan_dm_automations(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  position jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_automation_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage automation nodes"
  ON fan_dm_automation_nodes FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_nodes_owner ON fan_dm_automation_nodes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_nodes_automation ON fan_dm_automation_nodes(automation_id);

-- 9. AUTOMATION EDGES
CREATE TABLE IF NOT EXISTS fan_dm_automation_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES fan_dm_automations(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES fan_dm_automation_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES fan_dm_automation_nodes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fan_dm_automation_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage automation edges"
  ON fan_dm_automation_edges FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_edges_owner ON fan_dm_automation_edges(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_edges_automation ON fan_dm_automation_edges(automation_id);

-- 10. AUTOMATION RUNS
CREATE TABLE IF NOT EXISTS fan_dm_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES fan_dm_automations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE fan_dm_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view automation runs"
  ON fan_dm_automation_runs FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_runs_owner ON fan_dm_automation_runs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_dm_automation_runs_automation ON fan_dm_automation_runs(automation_id);

-- =====================================================
-- ADVANCED FEATURES
-- =====================================================

-- 11. TEMPLATES
CREATE TABLE IF NOT EXISTS fan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'dm',
  body text NOT NULL,
  variables jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage templates"
  ON fan_templates FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_templates_owner ON fan_templates(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_templates_category ON fan_templates(category);

-- 12. SEQUENCES
CREATE TABLE IF NOT EXISTS fan_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fan_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage sequences"
  ON fan_sequences FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_sequences_owner ON fan_sequences(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_sequences_status ON fan_sequences(status);

-- 13. SEQUENCE STEPS
CREATE TABLE IF NOT EXISTS fan_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES fan_sequences(id) ON DELETE CASCADE,
  step_index int NOT NULL DEFAULT 0,
  wait_minutes int DEFAULT 0,
  template_id uuid REFERENCES fan_templates(id) ON DELETE SET NULL,
  body_override text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fan_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage sequence steps"
  ON fan_sequence_steps FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_sequence_steps_owner ON fan_sequence_steps(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_sequence_steps_sequence ON fan_sequence_steps(sequence_id);

-- 14. SEQUENCE ENROLLMENTS
CREATE TABLE IF NOT EXISTS fan_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES fan_sequences(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  current_step_index int DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  enrolled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(sequence_id, conversation_id)
);

ALTER TABLE fan_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage enrollments"
  ON fan_sequence_enrollments FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_sequence_enrollments_owner ON fan_sequence_enrollments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_sequence_enrollments_sequence ON fan_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_fan_sequence_enrollments_status ON fan_sequence_enrollments(status);

-- 15. BROADCASTS
CREATE TABLE IF NOT EXISTS fan_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience jsonb DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES fan_templates(id) ON DELETE SET NULL,
  body_override text,
  scheduled_for timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fan_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage broadcasts"
  ON fan_broadcasts FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_broadcasts_owner ON fan_broadcasts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_broadcasts_status ON fan_broadcasts(status);

-- 16. BROADCAST SENDS
CREATE TABLE IF NOT EXISTS fan_broadcast_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broadcast_id uuid NOT NULL REFERENCES fan_broadcasts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES fan_dm_conversations(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fan_broadcast_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view broadcast sends"
  ON fan_broadcast_sends FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fan_broadcast_sends_owner ON fan_broadcast_sends(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_fan_broadcast_sends_broadcast ON fan_broadcast_sends(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_fan_broadcast_sends_status ON fan_broadcast_sends(status);

-- =====================================================
-- META CONNECTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text,
  meta_page_id text,
  meta_instagram_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their meta connections"
  ON user_meta_connections FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_meta_connections_user ON user_meta_connections(user_id);
