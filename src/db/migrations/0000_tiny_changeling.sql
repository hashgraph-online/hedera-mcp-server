CREATE TABLE `anomaly_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` text NOT NULL,
	`hedera_account_id` text NOT NULL,
	`event_type` text NOT NULL,
	`severity` text NOT NULL,
	`details` text,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP,
	`resolved` integer DEFAULT false,
	`resolved_at` text,
	`action_taken` text
);
--> statement-breakpoint
CREATE TABLE `api_key_historical_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` text NOT NULL,
	`hour` integer NOT NULL,
	`avg_request_count` real DEFAULT 0,
	`avg_response_time` real DEFAULT 0,
	`error_rate` real DEFAULT 0,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `api_key_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`method` text NOT NULL,
	`status_code` integer,
	`response_time_ms` integer,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `api_key_usage_api_key_idx` ON `api_key_usage` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_key_usage_created_at_idx` ON `api_key_usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`hedera_account_id` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`key_hash` text NOT NULL,
	`name` text,
	`permissions` text DEFAULT '["read"]',
	`status` text DEFAULT 'active',
	`rate_limit` integer DEFAULT 1000,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` text,
	`last_used_at` text,
	`is_active` integer DEFAULT true,
	`metadata` text DEFAULT '{}'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_account_id_idx` ON `api_keys` (`hedera_account_id`);--> statement-breakpoint
CREATE INDEX `api_keys_status_idx` ON `api_keys` (`status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	`event_type` text NOT NULL,
	`api_key_id` text,
	`hedera_account_id` text,
	`ip_address` text,
	`user_agent` text,
	`endpoint` text,
	`method` text,
	`status_code` integer,
	`response_time_ms` integer,
	`details` text,
	`severity` text DEFAULT 'info',
	`request_id` text
);
--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`hedera_account_id` text NOT NULL,
	`challenge` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`used` integer DEFAULT false,
	`ip_address` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE TABLE `conversion_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hbar_per_credit` real NOT NULL,
	`credits_per_hbar` real NOT NULL,
	`effective_date` text NOT NULL,
	`created_by` text DEFAULT 'system',
	`notes` text,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `credit_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`total_purchased` integer DEFAULT 0 NOT NULL,
	`total_consumed` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_balances_account_id_unique` ON `credit_balances` (`account_id`);--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`operational_mode` text NOT NULL,
	`credits_deducted` real NOT NULL,
	`credits_refunded` real DEFAULT 0,
	`transaction_status` text NOT NULL,
	`execution_time_ms` integer,
	`request_data` text,
	`response_data` text,
	`error_message` text,
	`hedera_transaction_id` text,
	`transaction_type` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`description` text,
	`related_operation` text,
	`hbar_payment_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `hbar_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` text NOT NULL,
	`payer_account_id` text NOT NULL,
	`target_account_id` text,
	`hbar_amount` real NOT NULL,
	`credits_allocated` integer NOT NULL,
	`conversion_rate` real NOT NULL,
	`memo` text,
	`network_fee` real,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP,
	`consensus_timestamp` text,
	`status` text DEFAULT 'pending',
	`hedera_account_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hbar_payments_transaction_id_unique` ON `hbar_payments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `operation_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation_name` text NOT NULL,
	`base_cost` integer NOT NULL,
	`description` text,
	`active` integer DEFAULT true,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operation_costs_operation_name_unique` ON `operation_costs` (`operation_name`);--> statement-breakpoint
CREATE TABLE `pricing_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_metadata_key_unique` ON `pricing_metadata` (`key`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`bucket_key` text NOT NULL,
	`window_start` text NOT NULL,
	`request_count` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`hedera_account_id` text NOT NULL,
	`session_data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_cache_api_key_idx` ON `session_cache` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `session_cache_expires_at_idx` ON `session_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tool_usage_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_name` text NOT NULL,
	`usage_date` text NOT NULL,
	`total_calls` integer DEFAULT 0,
	`total_credits_used` real DEFAULT 0,
	`avg_execution_time_ms` real,
	`success_rate` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text,
	`account_type` text DEFAULT 'ai_assistant',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_activity` text DEFAULT CURRENT_TIMESTAMP,
	`status` text DEFAULT 'active',
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_account_id_unique` ON `user_accounts` (`account_id`);