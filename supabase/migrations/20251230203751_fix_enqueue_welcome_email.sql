/*
  # Fix enqueue_welcome_email function

  ## Purpose
  Update enqueue_welcome_email to properly call enqueue_onboarding_email

  ## Changes
  - Drop existing function
  - Recreate with correct signature to call enqueue_onboarding_email
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS enqueue_welcome_email(uuid, text, text);

-- Recreate enqueue_welcome_email to use the correct function name
CREATE OR REPLACE FUNCTION enqueue_welcome_email(
  p_user_id uuid,
  p_user_email text,
  p_first_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Call the existing enqueue_onboarding_email function with welcome template
  SELECT enqueue_onboarding_email(
    p_user_id,
    p_user_email,
    'welcome',
    0  -- no delay
  ) INTO v_job_id;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enqueue_welcome_email TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_welcome_email TO authenticated;
