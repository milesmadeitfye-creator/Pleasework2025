/*
  # Ads Orchestrator System

  1. New Tables
    - `ads_automation_runs` - Logs each orchestrator run
    - `ads_automation_actions` - Logs individual actions

  2. Security
    - Enable RLS on both tables
    - Users can read their own runs/actions
*/

-- Runs table (orchestrator execution logs)
CREATE TABLE IF NOT EXISTS public.ads_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  goals_processed jsonb DEFAULT '[]'::jsonb,
  settings_snapshot jsonb DEFAULT '{}'::jsonb,
  campaigns_created int DEFAULT 0,
  campaigns_updated int DEFAULT 0,
  winners_promoted int DEFAULT 0,
  budgets_scaled int DEFAULT 0,
  adsets_paused int DEFAULT 0,
  errors_count int DEFAULT 0,
  error_message text,
  error_stack text
);

-- Actions table (individual orchestrator actions)
CREATE TABLE IF NOT EXISTS public.ads_automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ads_automation_runs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  goal_key text,
  campaign_id text,
  adset_id text,
  ad_id text,
  action_details jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result_message text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ads_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_automation_actions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own automation runs" ON public.ads_automation_runs;
  DROP POLICY IF EXISTS "Service role can insert automation runs" ON public.ads_automation_runs;
  DROP POLICY IF EXISTS "Service role can update automation runs" ON public.ads_automation_runs;
  DROP POLICY IF EXISTS "Users can read own automation actions" ON public.ads_automation_actions;
  DROP POLICY IF EXISTS "Service role can insert automation actions" ON public.ads_automation_actions;
  DROP POLICY IF EXISTS "Service role can update automation actions" ON public.ads_automation_actions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Policies for ads_automation_runs
CREATE POLICY "Users can read own automation runs"
  ON public.ads_automation_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert automation runs"
  ON public.ads_automation_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update automation runs"
  ON public.ads_automation_runs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for ads_automation_actions
CREATE POLICY "Users can read own automation actions"
  ON public.ads_automation_actions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert automation actions"
  ON public.ads_automation_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update automation actions"
  ON public.ads_automation_actions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ads_automation_runs_user_id ON public.ads_automation_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_automation_runs_started_at ON public.ads_automation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_automation_actions_run_id ON public.ads_automation_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_ads_automation_actions_user_id ON public.ads_automation_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_automation_actions_goal_key ON public.ads_automation_actions(goal_key);

-- Add orchestrator settings to user_ads_modes
ALTER TABLE public.user_ads_modes
  ADD COLUMN IF NOT EXISTS auto_scale_winners boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pause_losers boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS orchestrator_last_run timestamptz,
  ADD COLUMN IF NOT EXISTS global_daily_budget numeric(10,2) DEFAULT 10.00;
