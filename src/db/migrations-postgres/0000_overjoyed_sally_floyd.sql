CREATE TABLE "credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"balance" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_purchased" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_consumed" numeric(20, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "credit_balances_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"balance_after" numeric(20, 8) NOT NULL,
	"description" varchar(1000),
	"related_operation" varchar(255),
	"hbar_payment_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hbar_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar(255) NOT NULL,
	"payer_account_id" varchar(255) NOT NULL,
	"target_account_id" varchar(255),
	"hbar_amount" numeric(20, 8) NOT NULL,
	"credits_allocated" numeric(20, 8) NOT NULL,
	"memo" varchar(1000),
	"processed_at" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'pending',
	CONSTRAINT "hbar_payments_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "operation_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_name" varchar(255) NOT NULL,
	"base_cost" numeric(20, 8) NOT NULL,
	"description" varchar(1000),
	"active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "operation_costs_operation_name_unique" UNIQUE("operation_name")
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_activity" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'active',
	CONSTRAINT "user_accounts_account_id_unique" UNIQUE("account_id")
);
