ALTER TABLE `tasks` MODIFY COLUMN `note` varchar(2000) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `tasks` ADD `dueAt` bigint;