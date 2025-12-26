/*
  # Master Onboarding & Product Tour System

  1. New Tables
    - `user_tour_progress`
      - `user_id` (uuid, references auth.users)
      - `tour_started_at` (timestamptz)
      - `tour_completed_at` (timestamptz, nullable)
      - `current_chapter` (int)
      - `completed_chapters` (jsonb array)
      - `paused_at` (timestamptz, nullable)
      - `last_resumed_at` (timestamptz, nullable)
      - `tour_version` (text, for future updates)
      - `updated_at` (timestamptz)

    - `user_contextual_guides`
      - `user_id` (uuid, references auth.users)
      - `guide_id` (text, e.g. 'ads-manager-first-visit')
      - `shown_at` (timestamptz)
      - `dismissed_at` (timestamptz, nullable)
      - `completed` (boolean)

    - `user_action_coaching`
      - `user_id` (uuid, references auth.users)
      - `coaching_id` (text, e.g. 'link-created-not-shared')
      - `triggered_at` (timestamptz)
      - `dismissed_at` (timestamptz, nullable)
      - `action_taken` (boolean)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own records
*/

-- Create user_tour_progress table
CREATE TABLE IF NOT EXISTS user_tour_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_started_at timestamptz DEFAULT now(),
  tour_completed_at timestamptz,
  current_chapter int DEFAULT 1,
  completed_chapters jsonb DEFAULT '[]'::jsonb,
  paused_at timestamptz,
  last_resumed_at timestamptz,
  tour_version text DEFAULT '1.0',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_tour_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tour progress"
  ON user_tour_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tour progress"
  ON user_tour_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tour progress"
  ON user_tour_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create user_contextual_guides table
CREATE TABLE IF NOT EXISTS user_contextual_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id text NOT NULL,
  shown_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  completed boolean DEFAULT false,
  UNIQUE(user_id, guide_id)
);

ALTER TABLE user_contextual_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contextual guides"
  ON user_contextual_guides
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contextual guides"
  ON user_contextual_guides
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contextual guides"
  ON user_contextual_guides
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create user_action_coaching table
CREATE TABLE IF NOT EXISTS user_action_coaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  coaching_id text NOT NULL,
  triggered_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  action_taken boolean DEFAULT false,
  UNIQUE(user_id, coaching_id)
);

ALTER TABLE user_action_coaching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own action coaching"
  ON user_action_coaching
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own action coaching"
  ON user_action_coaching
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own action coaching"
  ON user_action_coaching
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_tour_progress_user_id ON user_tour_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tour_progress_completed ON user_tour_progress(tour_completed_at);
CREATE INDEX IF NOT EXISTS idx_user_contextual_guides_user_id ON user_contextual_guides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contextual_guides_guide_id ON user_contextual_guides(guide_id);
CREATE INDEX IF NOT EXISTS idx_user_action_coaching_user_id ON user_action_coaching(user_id);
CREATE INDEX IF NOT EXISTS idx_user_action_coaching_coaching_id ON user_action_coaching(coaching_id);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_user_tour_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_tour_progress_updated_at ON user_tour_progress;
CREATE TRIGGER user_tour_progress_updated_at
  BEFORE UPDATE ON user_tour_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_user_tour_progress_updated_at();
