ALTER TABLE `agent_logs` ADD `provider_id` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `route_reason` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `fallback_history_json` text;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `input_tokens` integer;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `output_tokens` integer;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `tool_rounds` integer;--> statement-breakpoint
ALTER TABLE `agent_logs` ADD `privacy_class` text;