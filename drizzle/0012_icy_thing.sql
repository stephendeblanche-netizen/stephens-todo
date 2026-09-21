CREATE TABLE `task_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`content_type` varchar(160) NOT NULL DEFAULT 'application/octet-stream',
	`size_bytes` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_attachments_storage_key_uidx` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE INDEX `task_attachments_task_idx` ON `task_attachments` (`task_id`);