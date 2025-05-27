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
	`memo` text,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP,
	`status` text DEFAULT 'pending'
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
CREATE TABLE `user_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_activity` text DEFAULT CURRENT_TIMESTAMP,
	`status` text DEFAULT 'active'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_account_id_unique` ON `user_accounts` (`account_id`);