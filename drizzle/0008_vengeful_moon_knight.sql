CREATE TABLE `mobile_push_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`installation_id` varchar(120) NOT NULL,
	`expo_push_token` varchar(255) NOT NULL,
	`platform` varchar(20) NOT NULL DEFAULT 'ios',
	`enabled` boolean NOT NULL DEFAULT true,
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mobile_push_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `mobile_push_devices_installation_uidx` UNIQUE(`installation_id`),
	CONSTRAINT `mobile_push_devices_token_uidx` UNIQUE(`expo_push_token`)
);
--> statement-breakpoint
CREATE TABLE `mobile_reminder_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`urgent_time_sast` varchar(5) NOT NULL DEFAULT '08:00',
	`due_time_sast` varchar(5) NOT NULL DEFAULT '09:00',
	`urgent_schedule_cron_task_uid` varchar(65),
	`due_schedule_cron_task_uid` varchar(65),
	`last_urgent_delivery_date` varchar(10),
	`last_due_delivery_date` varchar(10),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mobile_reminder_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mobile_reminder_urgent_task_uid_idx` ON `mobile_reminder_schedules` (`urgent_schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `mobile_reminder_due_task_uid_idx` ON `mobile_reminder_schedules` (`due_schedule_cron_task_uid`);