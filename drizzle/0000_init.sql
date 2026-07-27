CREATE TABLE `agent_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_summary` text,
	`output_json` text,
	`validation_result` text,
	`user_decision` text,
	`latency_ms` integer,
	`is_badcase` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_logs_agent` ON `agent_logs` (`agent`);--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_body_metrics_date` ON `body_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `cardio_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`duration_min` real NOT NULL,
	`distance_km` real,
	`avg_hr` integer,
	`intensity` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cardio_date` ON `cardio_logs` (`date`);--> statement-breakpoint
CREATE INDEX `idx_cardio_external` ON `cardio_logs` (`external_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`card_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_msgs_session` ON `chat_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name_zh` text NOT NULL,
	`name_en` text NOT NULL,
	`primary_muscles_json` text NOT NULL,
	`secondary_muscles_json` text DEFAULT '[]' NOT NULL,
	`equipment` text NOT NULL,
	`counting_type` text NOT NULL,
	`difficulty` integer DEFAULT 1 NOT NULL,
	`cues_json` text DEFAULT '[]' NOT NULL,
	`substitutes_json` text DEFAULT '[]' NOT NULL,
	`contraindications_json` text DEFAULT '[]' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_equipment` ON `exercises` (`equipment`);--> statement-breakpoint
CREATE TABLE `plan_days` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`label` text NOT NULL,
	`cardio_json` text,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_days_plan` ON `plan_days` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`revision_no` integer NOT NULL,
	`diff_json` text NOT NULL,
	`rollback_json` text,
	`reason` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_rev_plan` ON `plan_revisions` (`plan_id`);--> statement-breakpoint
CREATE TABLE `planned_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_day_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`sets` integer NOT NULL,
	`reps` text NOT NULL,
	`weight_kg` real,
	`rest_sec` integer DEFAULT 90 NOT NULL,
	`note` text,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_planned_ex_day` ON `planned_exercises` (`plan_day_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`duration_weeks` integer NOT NULL,
	`days_per_week` integer NOT NULL,
	`progression_rule` text NOT NULL,
	`source` text NOT NULL,
	`nutrition_json` text,
	`explanation` text,
	`started_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_no` integer NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`duration_sec` integer,
	`distance_m` real,
	`rpe` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`confidence` real,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_set_logs_session` ON `set_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_set_logs_exercise` ON `set_logs` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_oplog` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`payload_json` text,
	`ts` integer NOT NULL,
	`synced` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oplog_synced` ON `sync_oplog` (`synced`);--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`sex` text,
	`birth_year` integer,
	`height_cm` real,
	`weight_kg` real,
	`experience` text,
	`goal` text,
	`days_per_week` integer,
	`session_minutes` integer,
	`equipment_json` text,
	`injuries_json` text,
	`cardio_pref` text,
	`incomplete` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`plan_id` text,
	`plan_day_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text,
	`feeling` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_date` ON `workout_sessions` (`date`);