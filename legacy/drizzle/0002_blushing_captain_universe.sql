CREATE TABLE `day_activity_selections` (
	`logical_date` text NOT NULL,
	`activity_id` text NOT NULL,
	`selected` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_activity_selections_date_activity_idx` ON `day_activity_selections` (`logical_date`,`activity_id`);--> statement-breakpoint
CREATE TABLE `day_mood_selections` (
	`logical_date` text PRIMARY KEY NOT NULL,
	`mood_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`mood_id`) REFERENCES `mood_levels`(`id`) ON UPDATE no action ON DELETE no action
);
