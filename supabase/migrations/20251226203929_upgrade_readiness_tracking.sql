/*
  # Upgrade Readiness Tracking System
  
  ## Summary
  Adds fields to track user readiness for upgrade prompts and value interactions.
  Prevents early paywall prompts and enables smart upgrade timing.
  
  ## Changes to user_profiles
  - `login_count` (integer, default 0) - Increments on each successful auth session
  - `has_seen_upgrade_prompt` (boolean, default false) - Marks if user has seen upgrade UI
  - `value_actions_completed` (jsonb, default '{}') - Tracks which value actions user has done:
    - smart_link_created: boolean
    - one_click_created: boolean
    - message_drafted: boolean
    - ai_used: boolean
    - analytics_viewed: boolean
  
  ## New RPC Functions
  - `increment_login_count`: Safely increments login_count for authenticated user
  - `mark_value_action`: Records when user completes a value action
  - `is_upgrade_eligible`: Checks if user should see upgrade prompts
  
  ## Eligibility Logic
  User becomes upgrade-eligible when:
  - login_count >= 2
  - AND at least one value action is true
  - AND user_billing_v2.status NOT IN ('active','trialing')
  
  ## Security
  - All RPC functions check auth.uid()
  - Users can only modify their own records
  - Existing RLS policies apply
  
  ## Notes
  - Does NOT show upgrade prompts on first login
  - Does NOT require tutorial completion
  - Triggers based on familiarity + value interaction
  - No modal spam or refresh-based prompts
*/

-- Add new columns to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS has_seen_upgrade_prompt boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS value_actions_completed jsonb NOT NULL DEFAULT '{
  "smart_link_created": false,
  "one_click_created": false,
  "message_drafted": false,
  "ai_used": false,
  "analytics_viewed": false
}'::jsonb;

-- Function: Increment login count
CREATE OR REPLACE FUNCTION public.increment_login_count()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET login_count = login_count + 1
  WHERE user_id = auth.uid();
END;
$$;

-- Function: Mark value action
CREATE OR REPLACE FUNCTION public.mark_value_action(p_action_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow specific action keys
  IF p_action_key NOT IN (
    'smart_link_created',
    'one_click_created',
    'message_drafted',
    'ai_used',
    'analytics_viewed'
  ) THEN
    RAISE EXCEPTION 'Invalid action key: %', p_action_key;
  END IF;

  UPDATE public.user_profiles
  SET value_actions_completed = jsonb_set(
    value_actions_completed,
    ARRAY[p_action_key],
    'true'::jsonb
  )
  WHERE user_id = auth.uid();
END;
$$;

-- Function: Check upgrade eligibility
CREATE OR REPLACE FUNCTION public.is_upgrade_eligible()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_login_count integer;
  v_has_value_action boolean;
  v_billing_status text;
BEGIN
  -- Get user stats
  SELECT 
    p.login_count,
    (
      (p.value_actions_completed->>'smart_link_created')::boolean = true OR
      (p.value_actions_completed->>'one_click_created')::boolean = true OR
      (p.value_actions_completed->>'message_drafted')::boolean = true OR
      (p.value_actions_completed->>'ai_used')::boolean = true OR
      (p.value_actions_completed->>'analytics_viewed')::boolean = true
    ),
    COALESCE(b.status, 'free')
  INTO v_login_count, v_has_value_action, v_billing_status
  FROM public.user_profiles p
  LEFT JOIN public.user_billing_v2 b ON b.user_id = p.user_id
  WHERE p.user_id = auth.uid();

  -- User is eligible if:
  -- 1. Logged in at least 2 times
  -- 2. Completed at least one value action
  -- 3. Not currently on an active paid plan
  RETURN (
    v_login_count >= 2 AND
    v_has_value_action = true AND
    v_billing_status NOT IN ('active', 'trialing')
  );
END;
$$;

-- Function: Mark upgrade prompt shown
CREATE OR REPLACE FUNCTION public.mark_upgrade_prompt_shown()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET has_seen_upgrade_prompt = true
  WHERE user_id = auth.uid();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.increment_login_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_value_action(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_upgrade_eligible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_upgrade_prompt_shown() TO authenticated;
