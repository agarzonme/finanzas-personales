CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`institution` text,
	`currency` text DEFAULT 'COP' NOT NULL,
	`opening_balance_minor` integer DEFAULT 0 NOT NULL,
	`credit_limit_minor` integer,
	`aliases` text DEFAULT '[]' NOT NULL,
	`include_in_net_worth` integer DEFAULT true NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_uq` ON `accounts` (`name`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_from_uq` ON `budgets` (`category_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text,
	`is_essential` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_kind_name_uq` ON `categories` (`kind`,`name`);--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern` text NOT NULL,
	`category_id` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_pattern_uq` ON `category_rules` (`pattern`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text,
	`balance_minor` integer,
	`original_minor` integer NOT NULL,
	`rate_ea` real NOT NULL,
	`payment_minor` integer,
	`payment_day` integer,
	`currency` text DEFAULT 'COP' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `entries_account_idx` ON `entries` (`account_id`);--> statement-breakpoint
CREATE INDEX `entries_tx_idx` ON `entries` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`rate` real NOT NULL,
	PRIMARY KEY(`currency`, `date`)
);
--> statement-breakpoint
CREATE TABLE `goal_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_contrib_goal_idx` ON `goal_contributions` (`goal_id`,`date`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`target_minor` integer NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`target_date` text,
	`account_id` text,
	`initial_minor` integer DEFAULT 0 NOT NULL,
	`monthly_plan_minor` integer,
	`expected_return_ea` real DEFAULT 0 NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `net_worth_snapshots` (
	`date` text PRIMARY KEY NOT NULL,
	`assets_minor` integer NOT NULL,
	`liabilities_minor` integer NOT NULL,
	`investments_minor` integer NOT NULL,
	`net_worth_minor` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prices` (
	`security_id` text NOT NULL,
	`date` text NOT NULL,
	`price` real NOT NULL,
	PRIMARY KEY(`security_id`, `date`),
	FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `securities` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text,
	`asset_class` text DEFAULT 'etf' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`last_price` real,
	`last_price_date` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `securities_symbol_unique` ON `securities` (`symbol`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`base_currency` text DEFAULT 'COP' NOT NULL,
	`default_expense_account_id` text,
	`default_income_account_id` text,
	`default_card_account_id` text,
	`default_investment_account_id` text,
	`cash_account_id` text
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`security_id` text NOT NULL,
	`side` text NOT NULL,
	`quantity` real NOT NULL,
	`price` real NOT NULL,
	`fees_minor` integer DEFAULT 0 NOT NULL,
	`date` text NOT NULL,
	`transaction_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "trades_quantity_positive" CHECK("trades"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `trades_account_idx` ON `trades` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`to_amount_minor` integer,
	`amount_base_minor` integer NOT NULL,
	`fx_rate` real DEFAULT 1 NOT NULL,
	`category_id` text,
	`description` text NOT NULL,
	`notes` text,
	`goal_id` text,
	`debt_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tx_amount_positive" CHECK("transactions"."amount_minor" > 0),
	CONSTRAINT "tx_transfer_destination" CHECK(("transactions"."type" = 'transfer') = ("transactions"."to_account_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `tx_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `tx_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `tx_category_idx` ON `transactions` (`category_id`);