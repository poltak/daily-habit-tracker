-- Keep the five built-in moods on the canonical Daymark faces.
-- This is intentionally scoped to known IDs so imported/custom moods are unchanged.
UPDATE `mood_levels`
SET `emoji` = CASE `id`
  WHEN 'mood-rad' THEN '😄'
  WHEN 'mood-good' THEN '🙂'
  WHEN 'mood-meh' THEN '😐'
  WHEN 'mood-bad' THEN '☹️'
  WHEN 'mood-awful' THEN '😫'
END
WHERE `id` IN ('mood-rad', 'mood-good', 'mood-meh', 'mood-bad', 'mood-awful');
