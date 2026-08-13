CREATE TABLE `saved_filters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`priority` enum('all','high','medium','low') NOT NULL DEFAULT 'all',
	`dueRange` enum('all','today','this_week','next_7_days','overdue','no_due_date') NOT NULL DEFAULT 'all',
	`categoryId` int,
	`includeCompleted` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_filters_id` PRIMARY KEY(`id`)
);
