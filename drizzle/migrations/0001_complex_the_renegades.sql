CREATE TABLE `message_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int NOT NULL,
	`title` varchar(80) NOT NULL,
	`summary` varchar(180) NOT NULL,
	`body` text,
	`level` enum('safety','important','update','info') NOT NULL DEFAULT 'info',
	`actionLabel` varchar(32),
	`actionPath` varchar(128),
	`targetType` enum('all','user') NOT NULL,
	`targetUserId` int,
	`recipientCount` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','recalled') NOT NULL DEFAULT 'draft',
	`publishedAt` timestamp,
	`expiresAt` timestamp,
	`recalledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `message_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`readAt` timestamp,
	`displayedAt` timestamp,
	`dismissedAt` timestamp,
	`actionedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_message_campaign_user_unique` UNIQUE(`campaignId`,`userId`)
);
--> statement-breakpoint
CREATE INDEX `message_campaign_status_published_idx` ON `message_campaigns` (`status`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `message_campaign_creator_idx` ON `message_campaigns` (`createdByUserId`);--> statement-breakpoint
CREATE INDEX `user_message_user_read_created_idx` ON `user_messages` (`userId`,`readAt`,`createdAt`);