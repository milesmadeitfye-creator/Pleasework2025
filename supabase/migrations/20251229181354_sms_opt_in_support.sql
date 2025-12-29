/*
  # SMS Opt-In Support

  1. New Columns in user_profiles
    - `phone_e164` (text) - Phone number in E.164 format (e.g., +15551234567)
    - `sms_opt_in` (boolean) - Whether user has opted into SMS communications
    - `sms_opt_in_at` (timestamptz) - When user opted in
    - `sms_opt_in_source` (text) - Source of opt-in (e.g., 'signup', 'settings')
    - `sms_opt_in_ip` (text) - IP address at opt-in (optional, for compliance)

  2. Indexes
    - Unique index on phone_e164 (optional, prevents duplicate phone numbers)
    - Index on sms_opt_in for filtering

  3. Compliance
    - Phone data is optional
    - SMS opt-in requires explicit consent
    - Timestamp and source tracked for compliance
    - Mobile opt-in data will NOT be shared with third parties

  4. Important Notes
    - Phone numbers stored in E.164 format for consistency
    - SMS opt-in defaults to false (explicit consent required)
    - STOP/HELP compliance handled in application layer
*/

-- Add SMS-related columns to user_profiles
DO $$
BEGIN
  -- Phone number in E.164 format
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'phone_e164'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN phone_e164 text;
  END IF;

  -- SMS opt-in flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sms_opt_in'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sms_opt_in boolean DEFAULT false NOT NULL;
  END IF;

  -- Timestamp of opt-in
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sms_opt_in_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sms_opt_in_at timestamptz;
  END IF;

  -- Source of opt-in (e.g., 'signup', 'settings', 'campaign')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sms_opt_in_source'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sms_opt_in_source text;
  END IF;

  -- IP address at opt-in (optional, for compliance)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sms_opt_in_ip'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sms_opt_in_ip text;
  END IF;
END $$;

-- Create unique index on phone_e164 to prevent duplicate phone numbers
-- This is optional but recommended for data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_phone_e164_unique
  ON user_profiles(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Create index on sms_opt_in for filtering opted-in users
CREATE INDEX IF NOT EXISTS idx_user_profiles_sms_opt_in
  ON user_profiles(sms_opt_in)
  WHERE sms_opt_in = true;

-- Add comment documenting compliance requirement
COMMENT ON COLUMN user_profiles.phone_e164 IS 'Phone number in E.164 format. Mobile opt-in data will not be shared with third parties.';
COMMENT ON COLUMN user_profiles.sms_opt_in IS 'Explicit SMS opt-in consent. Required before sending any SMS. User can opt out by replying STOP.';
COMMENT ON COLUMN user_profiles.sms_opt_in_at IS 'Timestamp when user opted into SMS communications. Required for compliance.';
COMMENT ON COLUMN user_profiles.sms_opt_in_source IS 'Source of opt-in: signup, settings, campaign, etc. Required for compliance tracking.';
