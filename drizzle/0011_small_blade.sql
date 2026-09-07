CREATE TABLE `task_responsible_colleagues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` int NOT NULL,
	`direct_report_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_responsible_colleagues_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_responsible_colleagues_task_report_uidx` UNIQUE(`task_id`,`direct_report_id`)
);
--> statement-breakpoint
CREATE INDEX `task_responsible_colleagues_report_idx` ON `task_responsible_colleagues` (`direct_report_id`);