/*
  # Tour Auto-Launch Tracking
  
  ## Summary
  Adds tracking for automatic tour launch on first login.
  Ensures tour only auto-opens once per user.
  
  ## Changes to user_tour_progress
  - `tour_auto_shown` (boolean, default false) - Tracks if tour auto-launched on first login
  
  ## Purpose
  - Prevent tour from auto-opening on every login
  - Track first-time user onboarding flow
  - Allow manual tour restart while preventing spam
  
  ## Notes
  - Existing tour_started_at tracks when user actively started tour
  - tour_auto_shown tracks if auto-launch occurred (may be before tour_started_at)
  - User can always manually restart tour from /help
*/

-- Add tour_auto_shown column to track first-time auto-launch
ALTER TABLE public.user_tour_progress
ADD COLUMN IF NOT EXISTS tour_auto_shown boolean NOT NULL DEFAULT false;

-- Create helper function to check if tour should auto-launch
CREATE OR REPLACE FUNCTION public.should_auto_launch_tour()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_shown boolean;
BEGIN
  -- Check if tour has already auto-launched for this user
  SELECT tour_auto_shown INTO v_auto_shown
  FROM public.user_tour_progress
  WHERE user_id = auth.uid();
  
  -- If no record exists, user is brand new - should show tour
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If tour already auto-shown, don't show again
  RETURN NOT v_auto_shown;
END;
$$;

-- Create function to mark tour as auto-launched
CREATE OR REPLACE FUNCTION public.mark_tour_auto_launched()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Upsert tour progress record with auto_shown flag
  INSERT INTO public.user_tour_progress (
    user_id,
    tour_auto_shown,
    tour_started_at
  )
  VALUES (
    auth.uid(),
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    tour_auto_shown = true,
    tour_started_at = COALESCE(user_tour_progress.tour_started_at, now()),
    updated_at = now();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.should_auto_launch_tour() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_tour_auto_launched() TO authenticated;
