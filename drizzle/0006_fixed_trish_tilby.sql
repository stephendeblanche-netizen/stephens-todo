CREATE TABLE `dashboard_email_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sender` varchar(320) NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`enabled` boolean NOT NULL DEFAULT true,
	`lastSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_email_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `dashboard_email_schedule_task_uid_idx` ON `dashboard_email_schedules` (`schedule_cron_task_uid`);