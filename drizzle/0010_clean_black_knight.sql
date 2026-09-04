CREATE TABLE `microsoft_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`account_id` varchar(128) NOT NULL,
	`account_email` varchar(320),
	`display_name` varchar(255),
	`token_ciphertext` text NOT NULL,
	`token_expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `microsoft_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `microsoft_connections_user_uidx` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `microsoft_email_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`message_id` varchar(255) NOT NULL,
	`task_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `microsoft_email_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `microsoft_email_imports_user_message_uidx` UNIQUE(`user_id`,`message_id`)
);
--> statement-breakpoint
CREATE TABLE `microsoft_task_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`task_id` int NOT NULL,
	`event_id` varchar(255) NOT NULL,
	`web_link` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `microsoft_task_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `microsoft_task_events_user_task_uidx` UNIQUE(`user_id`,`task_id`)
);
