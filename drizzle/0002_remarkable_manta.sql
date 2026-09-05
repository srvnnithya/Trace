CREATE TABLE `market_refresh_state` (
	`watchlist_id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text NOT NULL,
	`last_result` text NOT NULL,
	`message` text,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
