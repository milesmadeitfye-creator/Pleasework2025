/*
  # One-Click Link Event Tracking

  1. Changes
    - Add `event_family` column to `link_click_events` for grouping (smart_link, one_click, presave, etc.)
    - Add `event_name` column to store specific event names (oneclicklink, oneclickspotify, etc.)
    - Update indexes for efficient querying by event type
    - Create view for one-click analytics

  2. Security
    - Maintains existing RLS policies
    - No breaking changes to existing queries
*/

-- Add event_family and event_name columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'link_click_events' AND column_name = 'event_family'
  ) THEN
    ALTER TABLE link_click_events ADD COLUMN event_family text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'link_click_events' AND column_name = 'event_name'
  ) THEN
    ALTER TABLE link_click_events ADD COLUMN event_name text;
  END IF;
END $$;

-- Backfill event_family and event_name for existing records
UPDATE link_click_events
SET
  event_family = CASE
    WHEN link_type = 'smart_link' THEN 'smart_link'
    WHEN link_type = 'presave' THEN 'presave'
    WHEN link_type = 'one_click' THEN 'one_click'
    ELSE 'other'
  END,
  event_name = COALESCE(event_name,
    CASE
      WHEN link_type = 'smart_link' AND platform IS NOT NULL THEN 'smartlink_' || platform
      WHEN link_type = 'one_click' AND platform IS NOT NULL THEN 'oneclick' || platform
      ELSE link_type
    END
  )
WHERE event_family IS NULL OR event_name IS NULL;

-- Create index for efficient event querying
CREATE INDEX IF NOT EXISTS idx_link_click_events_event_family
  ON link_click_events(event_family);

CREATE INDEX IF NOT EXISTS idx_link_click_events_event_name
  ON link_click_events(event_name);

CREATE INDEX IF NOT EXISTS idx_link_click_events_platform
  ON link_click_events(platform);

CREATE INDEX IF NOT EXISTS idx_link_click_events_owner_event
  ON link_click_events(owner_user_id, event_family, created_at DESC);

-- Create analytics view for one-click links
CREATE OR REPLACE VIEW one_click_analytics AS
SELECT
  owner_user_id,
  link_id,
  platform,
  event_name,
  COUNT(*) as click_count,
  COUNT(DISTINCT DATE(created_at)) as active_days,
  MIN(created_at) as first_click,
  MAX(created_at) as last_click,
  DATE(created_at) as click_date
FROM link_click_events
WHERE event_family = 'one_click'
GROUP BY owner_user_id, link_id, platform, event_name, DATE(created_at);

-- Create daily aggregation view
CREATE OR REPLACE VIEW one_click_daily_stats AS
SELECT
  owner_user_id,
  platform,
  DATE(created_at) as date,
  COUNT(*) as total_clicks,
  COUNT(DISTINCT link_id) as unique_links,
  COUNT(CASE WHEN event_name = 'oneclicklink' THEN 1 END) as base_events,
  COUNT(CASE WHEN event_name LIKE 'oneclick%' AND event_name != 'oneclicklink' THEN 1 END) as platform_events
FROM link_click_events
WHERE event_family = 'one_click'
GROUP BY owner_user_id, platform, DATE(created_at);

-- Grant access to views
GRANT SELECT ON one_click_analytics TO authenticated;
GRANT SELECT ON one_click_daily_stats TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN link_click_events.event_family IS 'Event grouping: smart_link, one_click, presave, etc.';
COMMENT ON COLUMN link_click_events.event_name IS 'Specific event name: oneclicklink, oneclickspotify, smartlink_spotify, etc.';
