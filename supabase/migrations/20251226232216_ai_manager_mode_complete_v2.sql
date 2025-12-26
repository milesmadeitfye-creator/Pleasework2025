/*
  # Ghoste AI Manager Mode - Complete System

  1. New Tables
    - `ai_manager_approvals` - Track YES/NO approval history
    - `creative_fatigue_log` - Track creative exhaustion events
    - `creative_requests` - Store creative briefs and filming schedules
    - `ai_manager_notifications` - Outbound notification queue
  
  2. Enhanced Columns
    - `ghoste_campaigns`: vibe_constraints, notification prefs, manager mode flags
    - `ad_creatives`: vibe_tags, fatigue_score, usage tracking
  
  3. Three-Action Philosophy
    - AI can ONLY recommend: SPEND_MORE, SPEND_LESS, MAKE_MORE_CREATIVES
    - All other logic is silent automation
    - User only interacts via YES/NO replies
  
  4. Student/Teacher Architecture
    - Student: Ghoste first-party data (stored)
    - Teacher: External analytics (ephemeral only, grade persisted)
    - Raw external data NEVER stored
  
  5. Safety
    - Budget increases require approval
    - Creative requests auto-pause ads
    - All actions logged
*/

-- Create vibe enum
DO $$ BEGIN
  CREATE TYPE campaign_vibe AS ENUM (
    'girls_women',
    'guys',
    'party',
    'chill_aesthetic',
    'underground_street',
    'mainstream_pop',
    'soft_emotional',
    'aggressive_hype'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create notification method enum
DO $$ BEGIN
  CREATE TYPE notification_method AS ENUM ('sms', 'email', 'both');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create approval action enum
DO $$ BEGIN
  CREATE TYPE approval_action AS ENUM (
    'spend_more',
    'spend_less',
    'make_more_creatives'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create approval response enum
DO $$ BEGIN
  CREATE TYPE approval_response AS ENUM ('yes', 'no', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add manager mode columns to ghoste_campaigns
DO $$ BEGIN
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS vibe_constraints campaign_vibe[];
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS notification_method notification_method DEFAULT 'email';
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS notification_phone text;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS notification_email text;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS manager_mode_enabled boolean DEFAULT true;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS analyst_mode_visible boolean DEFAULT false;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS silence_is_good boolean DEFAULT true;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS last_notification_at timestamptz;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add vibe and fatigue columns to ad_creatives
DO $$ BEGIN
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS vibe_tags campaign_vibe[];
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS fatigue_score int DEFAULT 0;
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS total_impressions bigint DEFAULT 0;
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS performance_trend text;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- AI Manager Approvals (YES/NO tracking)
CREATE TABLE IF NOT EXISTS public.ai_manager_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  
  action_requested approval_action NOT NULL,
  action_context jsonb DEFAULT '{}'::jsonb,
  
  notification_sent_at timestamptz NOT NULL DEFAULT now(),
  notification_method notification_method NOT NULL,
  notification_body text NOT NULL,
  
  response approval_response NOT NULL DEFAULT 'pending',
  response_received_at timestamptz,
  response_raw text,
  
  action_executed boolean DEFAULT false,
  action_executed_at timestamptz,
  execution_details jsonb DEFAULT '{}'::jsonb,
  
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Creative Fatigue Log
CREATE TABLE IF NOT EXISTS public.creative_fatigue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES ad_creatives(id) ON DELETE SET NULL,
  
  fatigue_detected_at timestamptz NOT NULL DEFAULT now(),
  fatigue_score int NOT NULL,
  
  impressions_total bigint,
  ctr_trend text,
  performance_drop_pct int,
  
  detection_reason text NOT NULL,
  confidence text NOT NULL,
  
  action_taken text NOT NULL,
  campaign_paused boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT creative_fatigue_log_score_range CHECK (fatigue_score >= 0 AND fatigue_score <= 100)
);

-- Creative Requests (briefs + filming schedules)
CREATE TABLE IF NOT EXISTS public.creative_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text NOT NULL,
  urgency text NOT NULL DEFAULT 'normal',
  
  brief_title text NOT NULL,
  brief_description text NOT NULL,
  brief_vibe_constraints campaign_vibe[],
  brief_hook_suggestions jsonb DEFAULT '[]'::jsonb,
  brief_inspo_references jsonb DEFAULT '[]'::jsonb,
  
  filming_suggested_date date,
  filming_time_of_day text,
  filming_duration_minutes int DEFAULT 30,
  calendar_event_id text,
  
  status text NOT NULL DEFAULT 'pending',
  fulfilled_at timestamptz,
  fulfilled_creative_ids uuid[],
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI Manager Notifications (outbound queue)
CREATE TABLE IF NOT EXISTS public.ai_manager_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  approval_id uuid REFERENCES ai_manager_approvals(id) ON DELETE SET NULL,
  
  notification_type text NOT NULL,
  notification_method notification_method NOT NULL,
  recipient_phone text,
  recipient_email text,
  
  subject text,
  body text NOT NULL,
  tone text NOT NULL DEFAULT 'casual',
  
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  
  expects_reply boolean DEFAULT false,
  reply_received boolean DEFAULT false,
  reply_body text,
  reply_received_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_manager_approvals_pending
  ON ai_manager_approvals(owner_user_id, response, expires_at)
  WHERE response = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_manager_approvals_campaign
  ON ai_manager_approvals(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creative_fatigue_log_campaign
  ON creative_fatigue_log(campaign_id, fatigue_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_creative_requests_pending
  ON creative_requests(owner_user_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_manager_notifications_pending
  ON ai_manager_notifications(status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_manager_notifications_campaign
  ON ai_manager_notifications(campaign_id, created_at DESC);

-- Enable RLS
ALTER TABLE ai_manager_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_fatigue_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_manager_notifications ENABLE ROW LEVEL SECURITY;

-- Policies: ai_manager_approvals
CREATE POLICY "Users can read own approvals"
  ON ai_manager_approvals FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own approvals"
  ON ai_manager_approvals FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert approvals"
  ON ai_manager_approvals FOR INSERT TO service_role
  WITH CHECK (true);

-- Policies: creative_fatigue_log
CREATE POLICY "Users can read own fatigue log"
  ON creative_fatigue_log FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert fatigue log"
  ON creative_fatigue_log FOR INSERT TO service_role
  WITH CHECK (true);

-- Policies: creative_requests
CREATE POLICY "Users can read own creative requests"
  ON creative_requests FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own creative requests"
  ON creative_requests FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert creative requests"
  ON creative_requests FOR INSERT TO service_role
  WITH CHECK (true);

-- Policies: ai_manager_notifications
CREATE POLICY "Users can read own notifications"
  ON ai_manager_notifications FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can manage notifications"
  ON ai_manager_notifications FOR ALL TO service_role
  USING (true);

COMMENT ON TABLE ai_manager_approvals IS 'Track YES/NO approval requests. AI can only ask for spend_more, spend_less, or make_more_creatives.';
COMMENT ON TABLE creative_fatigue_log IS 'Log creative exhaustion events. Triggers auto-pause and creative requests.';
COMMENT ON TABLE creative_requests IS 'Creative briefs with inspo and filming schedules. Auto-generated when more content needed.';
COMMENT ON TABLE ai_manager_notifications IS 'Outbound notification queue. Simple, jargon-free messages with optional YES/NO replies.';
