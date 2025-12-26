/*
  # Split Negotiation Invite Token Fix

  ## Purpose
  Fix the Open Negotiation 404 issue by adding proper invite token support.

  ## Changes
  1. Add invite_token to split_participants (unique, secure token for recipient access)
  2. Add status tracking (pending → invited → accepted/declined/countered)
  3. Add invite timestamps
  4. Add counter proposal fields
  5. Create index for fast token lookup

  ## Security
  - Tokens are UUIDs for security
  - Token grants access only to specific participant's view
  - RLS already enabled on split_participants
*/

-- Add invite token and status columns to split_participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'invite_token'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN invite_token uuid UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'status'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN status text DEFAULT 'pending' 
      CHECK (status IN ('pending', 'invited', 'accepted', 'declined', 'countered'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'invited_at'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN invited_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'responded_at'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN responded_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'counter_master_pct'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN counter_master_pct numeric(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'counter_publishing_pct'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN counter_publishing_pct numeric(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_participants' AND column_name = 'counter_notes'
  ) THEN
    ALTER TABLE split_participants ADD COLUMN counter_notes text;
  END IF;
END $$;

-- Create index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_split_participants_invite_token 
ON split_participants(invite_token) 
WHERE invite_token IS NOT NULL;

-- Generate tokens for existing participants that don't have one
UPDATE split_participants
SET invite_token = gen_random_uuid()
WHERE invite_token IS NULL;

COMMENT ON COLUMN split_participants.invite_token IS 'Unique token for recipient to access and respond to invitation';
COMMENT ON COLUMN split_participants.status IS 'Invitation status: pending, invited, accepted, declined, countered';
COMMENT ON COLUMN split_participants.invited_at IS 'When invitation email was sent';
COMMENT ON COLUMN split_participants.responded_at IS 'When recipient responded (accepted/declined/countered)';
COMMENT ON COLUMN split_participants.counter_master_pct IS 'Counter-proposal for master rights percentage';
COMMENT ON COLUMN split_participants.counter_publishing_pct IS 'Counter-proposal for publishing rights percentage';
COMMENT ON COLUMN split_participants.counter_notes IS 'Notes included with counter-proposal';
