ALTER TABLE `goals` ADD `material_icon` text DEFAULT 'task_alt' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `repeat_type` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
UPDATE `goals` SET `repeat_type` = 'weekly' WHERE `schedule_type` = 'times_per_week';
