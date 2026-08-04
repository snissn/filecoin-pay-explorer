CREATE TABLE `alert_claims` (
	`wallet_address` text PRIMARY KEY,
	`alert_level` text NOT NULL,
	`claimed_at` integer NOT NULL,
	`sent_at` integer,
	CONSTRAINT "alert_claim_wallet_address_lower" CHECK("wallet_address" = lower("wallet_address"))
);
