/*
  # Teacher Score System - Safe Storage (No Raw Analytics)

  1. New Table: teacher_scores
    - Stores ONLY computed scores (1-100), never raw analytics
    - Includes confidence band and human-readable reasons
    - Used to train Ghoste AI without exposing third-party data
  
  2. Security
    - RLS: owner_user_id can read their scores
    - Only service role can insert (system-generated)
    - CHECK constraint: score must be 1-100
  
  3. ABSOLUTE RULES
    - NO raw stream counts, follower counts, or play counts
    - NO raw Songstats/platform API responses
    - ONLY safe strings in reasons array
    - Teacher data used ephemerally, then discarded
*/

-- Create teacher_scores table
CREATE TABLE IF NOT EXISTS public.teacher_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  platform text,
  score int NOT NULL,
  confidence text NOT NULL,
  grade text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT teacher_scores_score_range CHECK (score >= 1 AND score <= 100),
  CONSTRAINT teacher_scores_entity_type_check CHECK (entity_type IN ('campaign', 'adset', 'link', 'artist', 'creative')),
  CONSTRAINT teacher_scores_confidence_check CHECK (confidence IN ('low', 'medium', 'high')),
  CONSTRAINT teacher_scores_grade_check CHECK (grade IN ('fail', 'weak', 'pass', 'strong'))
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_teacher_scores_owner_entity
  ON teacher_scores(owner_user_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_scores_platform
  ON teacher_scores(platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_scores_grade
  ON teacher_scores(grade, confidence);

CREATE INDEX IF NOT EXISTS idx_teacher_scores_window
  ON teacher_scores(window_start, window_end);

-- Enable RLS
ALTER TABLE teacher_scores ENABLE ROW LEVEL SECURITY;

-- Policy: owners can read their scores
CREATE POLICY "Users can read own teacher scores"
  ON teacher_scores
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Policy: only service role can insert (system-generated)
CREATE POLICY "Service role can insert teacher scores"
  ON teacher_scores
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create view for latest scores per entity
CREATE OR REPLACE VIEW latest_teacher_scores AS
SELECT DISTINCT ON (owner_user_id, entity_type, entity_id, platform)
  id,
  owner_user_id,
  entity_type,
  entity_id,
  platform,
  score,
  confidence,
  grade,
  window_start,
  window_end,
  reasons,
  created_at
FROM teacher_scores
ORDER BY owner_user_id, entity_type, entity_id, platform, created_at DESC;

-- Grant access to view
GRANT SELECT ON latest_teacher_scores TO authenticated;

-- Create aggregated score stats view
CREATE OR REPLACE VIEW teacher_score_stats AS
SELECT
  owner_user_id,
  entity_type,
  platform,
  grade,
  COUNT(*) as score_count,
  ROUND(AVG(score)) as avg_score,
  MIN(score) as min_score,
  MAX(score) as max_score,
  MIN(window_start) as first_scored,
  MAX(window_end) as last_scored
FROM teacher_scores
GROUP BY owner_user_id, entity_type, platform, grade;

-- Grant access to stats view
GRANT SELECT ON teacher_score_stats TO authenticated;

-- Add helpful comments
COMMENT ON TABLE teacher_scores IS 'Stores computed performance scores (1-100) ONLY. Raw analytics NEVER stored here.';
COMMENT ON COLUMN teacher_scores.score IS 'Computed score 1-100. Raw analytics discarded after computation.';
COMMENT ON COLUMN teacher_scores.reasons IS 'Safe human-readable reasons. NO raw numbers or analytics values allowed.';
COMMENT ON COLUMN teacher_scores.confidence IS 'Statistical confidence: low (small sample), medium (default), high (large sample + stable)';
COMMENT ON COLUMN teacher_scores.grade IS 'Performance band: fail (1-39), weak (40-59), pass (60-79), strong (80-100)';
