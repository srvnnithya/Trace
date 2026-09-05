CREATE TABLE `session_checkpoint_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`checkpoint_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `session_checkpoints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_checkpoint_snapshots_checkpoint_instrument` ON `session_checkpoint_snapshots` (`checkpoint_id`,`instrument_id`);