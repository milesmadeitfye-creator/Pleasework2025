/*
  # AI Manager Stability & Lockdown

  1. Global Killswitch
    - System-wide pause_all_ads flag
    - Per-campaign disable_ai_actions flag
    - Emergency stop controls
  
  2. Approval Links
    - Replace YES/NO SMS parsing with web links
    - /ai/approve?decision_id=UUID
    - /ai/decline?decision_id=UUID
  
  3. Strict Action Enum
    - Only 4 actions allowed
    - Force NO_ACTION when confidence low
  
  4. Budget Safety
    - Never auto-increase spend
    - Always can pause
    - Log all budget changes
  
  5. Silence Mode
    - Max 1 message per 24h
    - Only required actions
    - No status updates
*/

-- Create strict action enum
DO $$ BEGIN
  CREATE TYPE ai_manager_action AS ENUM (
    'spend_more',
    'spend_less',
    'make_more_creatives',
    'no_action'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Global killswitch table
CREATE TABLE IF NOT EXISTS public.ai_manager_killswitch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pause_all_ads boolean DEFAULT false,
  disable_ai_actions boolean DEFAULT false,
  reason text,
  enabled_by uuid REFERENCES auth.users(id),
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default killswitch record (off by default)
INSERT INTO public.ai_manager_killswitch (pause_all_ads, disable_ai_actions)
VALUES (false, false)
ON CONFLICT DO NOTHING;

-- Add approval link columns to ai_manager_approvals
DO $$ BEGIN
  ALTER TABLE ai_manager_approvals ADD COLUMN IF NOT EXISTS approval_link text;
  ALTER TABLE ai_manager_approvals ADD COLUMN IF NOT EXISTS decline_link text;
  ALTER TABLE ai_manager_approvals ADD COLUMN IF NOT EXISTS approved_via text;
  ALTER TABLE ai_manager_approvals ADD COLUMN IF NOT EXISTS requires_user_action boolean DEFAULT true;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add silence mode tracking to ghoste_campaigns
DO $$ BEGIN
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS last_ai_message_at timestamptz;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS ai_message_count_24h int DEFAULT 0;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS force_silence_mode boolean DEFAULT true;
  ALTER TABLE ghoste_campaigns ADD COLUMN IF NOT EXISTS disable_ai_actions boolean DEFAULT false;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add budget safety tracking
CREATE TABLE IF NOT EXISTS public.ai_budget_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  
  -- Change details
  action ai_manager_action NOT NULL,
  old_budget_cents int NOT NULL,
  new_budget_cents int NOT NULL,
  change_pct numeric(5,2),
  
  -- Authorization
  approval_id uuid REFERENCES ai_manager_approvals(id),
  authorized_by text NOT NULL,
  
  -- Safety
  safety_checks_passed boolean DEFAULT true,
  safety_warnings jsonb DEFAULT '[]'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add decision log table
CREATE TABLE IF NOT EXISTS public.ai_manager_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  
  -- Evaluation cycle
  evaluation_timestamp timestamptz NOT NULL DEFAULT now(),
  
  -- Student data (aggregated only)
  student_signals jsonb DEFAULT '{}'::jsonb,
  
  -- Teacher score (abstract only, never raw data)
  teacher_score int,
  teacher_grade text,
  teacher_confidence text,
  teacher_reasons text[],
  
  -- Decision
  action_decided ai_manager_action NOT NULL,
  confidence text NOT NULL,
  reason text NOT NULL,
  
  -- Execution
  executed boolean DEFAULT false,
  executed_at timestamptz,
  execution_result jsonb DEFAULT '{}'::jsonb,
  
  -- Safety
  killswitch_active boolean DEFAULT false,
  silence_mode_active boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add Mailchimp automation tracking
CREATE TABLE IF NOT EXISTS public.ai_mailchimp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  approval_id uuid REFERENCES ai_manager_approvals(id) ON DELETE SET NULL,
  
  -- Automation details
  automation_type text NOT NULL,
  trigger_reason text NOT NULL,
  
  -- Mailchimp
  mailchimp_campaign_id text,
  mailchimp_status text,
  
  -- Message
  subject text,
  body text NOT NULL,
  
  -- Recipient
  recipient_email text,
  recipient_phone text,
  delivery_method text NOT NULL,
  
  -- Delivery
  triggered_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_budget_changes_campaign
  ON ai_budget_changes(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_manager_decisions_campaign
  ON ai_manager_decisions(campaign_id, evaluation_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_manager_decisions_action
  ON ai_manager_decisions(action_decided, created_at DESC)
  WHERE action_decided != 'no_action';

CREATE INDEX IF NOT EXISTS idx_ai_mailchimp_automations_pending
  ON ai_mailchimp_automations(triggered_at)
  WHERE sent_at IS NULL;

-- Enable RLS
ALTER TABLE ai_manager_killswitch ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_manager_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_mailchimp_automations ENABLE ROW LEVEL SECURITY;

-- Policies: ai_manager_killswitch (read-only for users, service role can manage)
CREATE POLICY "Users can view killswitch status"
  ON ai_manager_killswitch FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage killswitch"
  ON ai_manager_killswitch FOR ALL TO service_role
  USING (true);

-- Policies: ai_budget_changes
CREATE POLICY "Users can read own budget changes"
  ON ai_budget_changes FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert budget changes"
  ON ai_budget_changes FOR INSERT TO service_role
  WITH CHECK (true);

-- Policies: ai_manager_decisions
CREATE POLICY "Users can read own decisions"
  ON ai_manager_decisions FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert decisions"
  ON ai_manager_decisions FOR INSERT TO service_role
  WITH CHECK (true);

-- Policies: ai_mailchimp_automations
CREATE POLICY "Users can read own automations"
  ON ai_mailchimp_automations FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can manage automations"
  ON ai_mailchimp_automations FOR ALL TO service_role
  USING (true);

-- Add helpful comments
COMMENT ON TABLE ai_manager_killswitch IS 'Global emergency stop for AI Manager. Always check before executing actions.';
COMMENT ON TABLE ai_budget_changes IS 'Audit log of all AI-driven budget changes. Requires approval for increases.';
COMMENT ON TABLE ai_manager_decisions IS 'Complete decision log. Records evaluation cycle, score, action, and reason.';
COMMENT ON TABLE ai_mailchimp_automations IS 'Mailchimp automation triggers. AI never sends messages directly.';

COMMENT ON COLUMN ai_manager_decisions.teacher_score IS 'Abstract score 1-100. Raw third-party data NEVER stored.';
COMMENT ON COLUMN ai_manager_decisions.action_decided IS 'One of 4 actions: spend_more, spend_less, make_more_creatives, no_action';
COMMENT ON COLUMN ai_manager_decisions.silence_mode_active IS 'True = AI stayed silent this cycle (preferred state)';
COMMENT ON COLUMN ai_mailchimp_automations.automation_type IS 'One of: approval_request, creative_request, pause_notice';
