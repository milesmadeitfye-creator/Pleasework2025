/*
  # Add Attachments Support to AI Messages

  ## Changes
  1. Add `attachments` JSONB column to `ai_messages` table
     - Stores structured attachment metadata (type, filename, url, size)
     - Replaces storing attachments in generic `meta` column
  2. Create index for querying messages with attachments
  3. Add helper function to extract attachment URLs from messages

  ## Attachment Structure
  ```json
  [
    {
      "id": "uuid",
      "kind": "video|image|audio|file",
      "filename": "my-video.mp4",
      "mime": "video/mp4",
      "size": 1234567,
      "url": "https://...",
      "duration": 30 (optional, for video/audio)
    }
  ]
  ```

  ## Security
  - No sensitive storage paths exposed in attachments
  - Only public URLs and metadata stored
  - RLS policies inherit from ai_messages table

  ## Migration Notes
  - Safe to run: adds nullable column with default '[]'
  - Existing messages unaffected
  - Can backfill from meta.attachments if needed
*/

-- Add attachments column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ai_messages'
    AND column_name = 'attachments'
  ) THEN
    ALTER TABLE public.ai_messages
    ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb NOT NULL;

    COMMENT ON COLUMN public.ai_messages.attachments IS 'Structured attachment metadata (videos, images, audio files attached to message)';
  END IF;
END $$;

-- Create index for messages with attachments
CREATE INDEX IF NOT EXISTS idx_ai_messages_has_attachments
  ON public.ai_messages ((jsonb_array_length(attachments) > 0))
  WHERE jsonb_array_length(attachments) > 0;

COMMENT ON INDEX idx_ai_messages_has_attachments IS 'Quickly find messages with attachments';

-- Helper function: Get all attachment URLs from a message
CREATE OR REPLACE FUNCTION public.ai_message_attachment_urls(message_id UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
AS $$
  SELECT ARRAY(
    SELECT jsonb_array_elements(attachments)->>'url'
    FROM public.ai_messages
    WHERE id = message_id
  );
$$;

COMMENT ON FUNCTION public.ai_message_attachment_urls IS 'Extract all attachment URLs from a message';
