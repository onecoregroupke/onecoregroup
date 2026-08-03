-- Migration 047: Chat message attachments.
--
-- Additive. One optional attachment per chat message. The file itself lives in a
-- PRIVATE Storage bucket (`chat-attachments`), keyed by conversation id; access
-- is via short-lived signed URLs generated only for conversation members (the
-- same server-side membership gate that already protects message reads). We store
-- only metadata here — never a public URL.

ALTER TABLE ocg_messages
  ADD COLUMN IF NOT EXISTS attachment_path TEXT   NOT NULL DEFAULT '',  -- private storage path
  ADD COLUMN IF NOT EXISTS attachment_name TEXT   NOT NULL DEFAULT '',  -- original filename (display)
  ADD COLUMN IF NOT EXISTS attachment_type TEXT   NOT NULL DEFAULT '',  -- validated MIME type
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT NOT NULL DEFAULT 0;   -- bytes
