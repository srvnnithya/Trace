CREATE TABLE IF NOT EXISTS `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`sector` text NOT NULL,
	`benchmark_symbol` text NOT NULL,
	`normal_daily_volatility` real NOT NULL,
	`high_52w` real NOT NULL,
	`low_52w` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_instruments_symbol` ON `instruments` (`symbol`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`session_number` integer NOT NULL,
	`price` real NOT NULL,
	`volume` integer NOT NULL,
	`average_volume_20d` integer NOT NULL,
	`benchmark_return` real NOT NULL,
	`day_return` real NOT NULL,
	`source` text NOT NULL,
	`secondary_source` text,
	`secondary_price` real,
	`source_timestamp` text NOT NULL,
	`received_at` text NOT NULL,
	`freshness_status` text NOT NULL,
	`confidence_status` text NOT NULL,
	`ingestion_key` text NOT NULL,
	`event_title` text,
	`news_sentiment` text,
	`news_mentions` integer DEFAULT 0 NOT NULL,
	`price_path_json` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_market_snapshots_ingestion_key` ON `market_snapshots` (`ingestion_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_market_snapshots_instrument_session` ON `market_snapshots` (`instrument_id`,`session_number`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`watchlist_item_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`reviewed_at` text NOT NULL,
	FOREIGN KEY (`watchlist_item_id`) REFERENCES `watchlist_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_review_events_item_time` ON `review_events` (`watchlist_item_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`watchlist_id` text NOT NULL,
	`created_at` text NOT NULL,
	`delivered` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_session_checkpoints_user_time` ON `session_checkpoints` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`watchlist_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`position` integer NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`last_reviewed_snapshot_id` text,
	`reviewed_at` text,
	`price_threshold` real,
	`volume_threshold` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_reviewed_snapshot_id`) REFERENCES `market_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_watchlist_items_watchlist_instrument` ON `watchlist_items` (`watchlist_id`,`instrument_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_watchlist_items_watchlist_position` ON `watchlist_items` (`watchlist_id`,`position`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `watchlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`benchmark_symbol` text NOT NULL,
	`price_threshold` real DEFAULT 0.02 NOT NULL,
	`volume_threshold` real DEFAULT 2 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_watchlists_user` ON `watchlists` (`user_id`);
