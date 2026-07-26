CREATE TABLE `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`label` text NOT NULL,
	`language` text NOT NULL,
	`translator` text,
	`editor` text,
	`publisher` text,
	`published_year` integer,
	`isbn` text,
	`source_url` text,
	`rights_status` text DEFAULT 'unknown' NOT NULL,
	`license_note` text,
	`r2_key` text,
	`original_filename` text,
	`mime_type` text,
	`file_sha256` text,
	`file_size` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `editions_work_status_idx` ON `editions` (`work_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `editions_r2_key_unique` ON `editions` (`r2_key`);--> statement-breakpoint
CREATE TABLE `passages` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`locator` text NOT NULL,
	`citation_label` text,
	`original_text` text,
	`translation_text` text,
	`interpretive_note` text NOT NULL,
	`search_text` text NOT NULL,
	`themes_json` text DEFAULT '[]' NOT NULL,
	`kind` text DEFAULT 'doctrine' NOT NULL,
	`evidence_class` text DEFAULT 'P1' NOT NULL,
	`agent_use` text DEFAULT 'QUALIFIED_FIRST_PERSON' NOT NULL,
	`period` text,
	`claim_ids_json` text DEFAULT '[]' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passages_edition_sequence_unique` ON `passages` (`edition_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `passages_edition_status_idx` ON `passages` (`edition_id`,`status`);--> statement-breakpoint
CREATE INDEX `passages_kind_priority_idx` ON `passages` (`kind`,`priority`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`philosopher_id` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`work_type` text DEFAULT 'book' NOT NULL,
	`original_language` text,
	`first_published_year` integer,
	`source_tier` text DEFAULT 'P1' NOT NULL,
	`rights_status` text DEFAULT 'unknown' NOT NULL,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `works_philosopher_status_idx` ON `works` (`philosopher_id`,`status`);