CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`material_icon` text DEFAULT '✨' NOT NULL,
	`source_icon_id` text,
	`sort_order` integer NOT NULL,
	`archived_at` text,
	`source_system` text,
	`source_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `activity_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activity_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`archived_at` text,
	`source_system` text,
	`source_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`logical_date` text NOT NULL,
	`local_time` text,
	`timezone` text,
	`timezone_offset_minutes` integer,
	`mood_id` text NOT NULL,
	`legacy_note_title` text,
	`legacy_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`source_system` text,
	`source_id` text,
	`source_created_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`mood_id`) REFERENCES `mood_levels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_logical_date_idx` ON `entries` (`logical_date`);--> statement-breakpoint
CREATE TABLE `entry_activities` (
	`entry_id` text NOT NULL,
	`activity_id` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_activities_pair_idx` ON `entry_activities` (`entry_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `goal_completions` (
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
CREATE UNIQUE INDEX `goal_completions_goal_date_idx` ON `goal_completions` (`goal_id`,`logical_date`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
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
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_system` text NOT NULL,
	`source_sha256` text NOT NULL,
	`source_version` text,
	`status` text NOT NULL,
	`report_json` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_runs_source_sha256_idx` ON `import_runs` (`source_sha256`);--> statement-breakpoint
CREATE TABLE `mood_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL,
	`source_system` text,
	`source_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mood_levels_score_idx` ON `mood_levels` (`score`);