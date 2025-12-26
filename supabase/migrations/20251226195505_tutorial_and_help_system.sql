/*
  # Tutorial and Help System Infrastructure

  1. New Tables
    - `user_tutorial_progress`
      - `user_id` (uuid, references auth.users)
      - `completed_steps` (jsonb, array of step IDs)
      - `is_complete` (boolean)
      - `updated_at` (timestamptz)
    - `user_preferences`
      - `user_id` (uuid, references auth.users)
      - `preferences` (jsonb, key-value store for user preferences)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only read/write their own records
*/

-- Create user_tutorial_progress table
CREATE TABLE IF NOT EXISTS user_tutorial_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_steps jsonb DEFAULT '[]'::jsonb,
  is_complete boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_tutorial_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tutorial progress"
  ON user_tutorial_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tutorial progress"
  ON user_tutorial_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tutorial progress"
  ON user_tutorial_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_tutorial_progress_user_id ON user_tutorial_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tutorial_progress_is_complete ON user_tutorial_progress(is_complete);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Add updated_at trigger for user_tutorial_progress
CREATE OR REPLACE FUNCTION update_user_tutorial_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_tutorial_progress_updated_at ON user_tutorial_progress;
CREATE TRIGGER user_tutorial_progress_updated_at
  BEFORE UPDATE ON user_tutorial_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_user_tutorial_progress_updated_at();

-- Add updated_at trigger for user_preferences
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_preferences_updated_at ON user_preferences;
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();
