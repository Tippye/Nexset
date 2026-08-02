CREATE TABLE `sync_inbox` (
	`op_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`payload_json` text,
	`ts` integer NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_inbox_row` ON `sync_inbox` (`table_name`,`row_id`);--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `provider_kind` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `route_mode` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `estimated_cost_usd_micros` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `degraded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_oplog` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_oplog` ADD `next_attempt_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_oplog` ADD `last_error` text;