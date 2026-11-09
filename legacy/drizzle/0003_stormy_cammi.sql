PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `goals` RENAME TO `__old_goals`;--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text,
	`name` text NOT NULL,
	`schedule_type` text NOT NULL,
	`target_per_week` integer,
	`weekdays_mask` integer,
	`start_date` text,
	`end_date` text,
	`reminder_enabled` integer DEFAULT false NOT NULL,
	`reminder_time` text,
	`sort_order` integer NOT NULL,
	`archived_at` text,
	`source_system` text,
	`source_id` text,
	`source_repeat_type` integer,
	`source_repeat_value` integer,
	`source_state` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `goals`("id", "activity_id", "name", "schedule_type", "target_per_week", "weekdays_mask", "start_date", "end_date", "reminder_enabled", "reminder_time", "sort_order", "archived_at", "source_system", "source_id", "source_repeat_type", "source_repeat_value", "source_state", "created_at", "updated_at") SELECT "id", "activity_id", "name", "schedule_type", "target_per_week", "weekdays_mask", "start_date", "end_date", "reminder_enabled", "reminder_time", "sort_order", "archived_at", "source_system", "source_id", "source_repeat_type", "source_repeat_value", "source_state", "created_at", "updated_at" FROM `__old_goals`;--> statement-breakpoint
CREATE TABLE `__new_goal_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`logical_date` text NOT NULL,
	`local_time` text,
	`entry_id` text,
	`source_system` text,
	`source_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_goal_completions`("id", "goal_id", "logical_date", "local_time", "entry_id", "source_system", "source_id", "created_at", "updated_at") SELECT "id", "goal_id", "logical_date", "local_time", "entry_id", "source_system", "source_id", "created_at", "updated_at" FROM `goal_completions`;--> statement-breakpoint
DROP TABLE `goal_completions`;--> statement-breakpoint
ALTER TABLE `__new_goal_completions` RENAME TO `goal_completions`;--> statement-breakpoint
CREATE UNIQUE INDEX `goal_completions_goal_date_idx` ON `goal_completions` (`goal_id`,`logical_date`);--> statement-breakpoint
DROP TABLE `__old_goals`;
