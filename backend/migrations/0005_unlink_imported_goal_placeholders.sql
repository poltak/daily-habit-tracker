-- Older imports created one archived placeholder activity per unlinked goal.
-- Remove only those links. Keep the placeholder rows so no historical data is
-- deleted and preserve links to real activities with the same name.
UPDATE `goals`
SET `activity_id` = NULL
WHERE `activity_id` IN (
  SELECT `activities`.`id`
  FROM `activities`
  WHERE `activities`.`source_system` = 'daylio'
    AND `activities`.`id` GLOB 'daylio-activity-unlinked-goal-*'
    AND `activities`.`source_id` GLOB '__unlinked_goal_*__'
    AND `activities`.`group_id` = 'daylio-group-unlinked-goals'
);
