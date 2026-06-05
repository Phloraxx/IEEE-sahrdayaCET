import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`)
  await db.run(sql`CREATE TABLE \`users_teams\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`team\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_teams_order_idx\` ON \`users_teams\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_teams_parent_id_idx\` ON \`users_teams\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users_accounts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`provider\` text NOT NULL,
  	\`provider_account_id\` text NOT NULL,
  	\`type\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_accounts_order_idx\` ON \`users_accounts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_accounts_parent_id_idx\` ON \`users_accounts\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`users_accounts_provider_account_id_idx\` ON \`users_accounts\` (\`provider_account_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`email\` text NOT NULL,
  	\`email_verified\` text,
  	\`name\` text,
  	\`image\` text,
  	\`phone\` text,
  	\`sahrdaya_email\` text,
  	\`semester\` text,
  	\`department\` text,
  	\`section\` text,
  	\`roll_number\` text,
  	\`food_preference\` text,
  	\`residence\` text,
  	\`profile_completed\` integer DEFAULT false,
  	\`role\` text DEFAULT 'user' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`societies\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`bio\` text,
  	\`logo_id\` integer,
  	\`banner_id\` integer,
  	\`is_hidden\` integer DEFAULT false,
  	\`display_order\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`banner_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`societies_name_idx\` ON \`societies\` (\`name\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`societies_slug_idx\` ON \`societies\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`societies_logo_idx\` ON \`societies\` (\`logo_id\`);`)
  await db.run(sql`CREATE INDEX \`societies_banner_idx\` ON \`societies\` (\`banner_id\`);`)
  await db.run(sql`CREATE INDEX \`societies_updated_at_idx\` ON \`societies\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`societies_created_at_idx\` ON \`societies\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`societies_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`societies\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`societies_rels_order_idx\` ON \`societies_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`societies_rels_parent_idx\` ON \`societies_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`societies_rels_path_idx\` ON \`societies_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`societies_rels_users_id_idx\` ON \`societies_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`execom\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`position\` text NOT NULL,
  	\`society_id\` integer,
  	\`photo_id\` integer,
  	\`section_id\` text,
  	\`order\` numeric,
  	\`batch\` text,
  	\`department\` text,
  	\`linkedin\` text,
  	\`email\` text,
  	\`phone\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`execom_society_idx\` ON \`execom\` (\`society_id\`);`)
  await db.run(sql`CREATE INDEX \`execom_photo_idx\` ON \`execom\` (\`photo_id\`);`)
  await db.run(sql`CREATE INDEX \`execom_section_id_idx\` ON \`execom\` (\`section_id\`);`)
  await db.run(sql`CREATE INDEX \`execom_updated_at_idx\` ON \`execom\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`execom_created_at_idx\` ON \`execom\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`description\` text,
  	\`date\` text NOT NULL,
  	\`end_date\` text,
  	\`venue\` text NOT NULL,
  	\`price\` numeric DEFAULT 0 NOT NULL,
  	\`society_id\` integer NOT NULL,
  	\`banner_id\` integer,
  	\`status\` text DEFAULT 'draft',
  	\`max_capacity\` numeric DEFAULT 0,
  	\`registered_count\` numeric DEFAULT 0,
  	\`checked_in_count\` numeric DEFAULT 0,
  	\`registration_open\` integer DEFAULT true,
  	\`registration_start\` text,
  	\`registration_deadline\` text,
  	\`form_template\` text,
  	\`enable_waitlist\` integer DEFAULT false,
  	\`waitlist_limit\` numeric,
  	\`waitlist_count\` numeric DEFAULT 0,
  	\`is_paid\` integer DEFAULT false,
  	\`ieee_member_price\` numeric,
  	\`non_member_price\` numeric,
  	\`early_bird_price\` numeric,
  	\`early_bird_deadline\` text,
  	\`pricing_tiers\` text,
  	\`currency\` text DEFAULT 'INR',
  	\`check_in_enabled\` integer DEFAULT true,
  	\`self_check_in\` integer DEFAULT false,
  	\`contact_email\` text,
  	\`contact_phone\` text,
  	\`external_link\` text,
  	\`tags\` text,
  	\`category\` text,
  	\`speakers\` text,
  	\`schedule\` text,
  	\`faqs\` text,
  	\`is_deleted\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`banner_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`events_slug_idx\` ON \`events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`events_society_idx\` ON \`events\` (\`society_id\`);`)
  await db.run(sql`CREATE INDEX \`events_banner_idx\` ON \`events\` (\`banner_id\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`events_status_idx\` ON \`events\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`events_is_deleted_idx\` ON \`events\` (\`is_deleted\`);`)
  await db.run(sql`CREATE INDEX \`events_date_idx\` ON \`events\` (\`date\`);`)
  await db.run(sql`CREATE TABLE \`registrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` text NOT NULL,
  	\`event_id\` integer NOT NULL,
  	\`user_name\` text,
  	\`user_email\` text,
  	\`user_phone\` text,
  	\`form_responses\` text,
  	\`payment_status\` text DEFAULT 'pending',
  	\`payment_amount\` numeric,
  	\`payment_ticket_id\` text,
  	\`registration_status\` text DEFAULT 'pending',
  	\`registration_date\` text,
  	\`ticket\` text,
  	\`checked_in\` integer DEFAULT false,
  	\`checked_in_at\` text,
  	\`checked_in_by_id\` text,
  	\`last_check_in_location\` text,
  	\`check_in_history\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`checked_in_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`registrations_user_idx\` ON \`registrations\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`registrations_event_idx\` ON \`registrations\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`registrations_checked_in_by_idx\` ON \`registrations\` (\`checked_in_by_id\`);`)
  await db.run(sql`CREATE INDEX \`registrations_updated_at_idx\` ON \`registrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`registrations_created_at_idx\` ON \`registrations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`registrations_registration_status_idx\` ON \`registrations\` (\`registration_status\`);`)
  await db.run(sql`CREATE INDEX \`registrations_payment_status_idx\` ON \`registrations\` (\`payment_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`registrations_user_event_unique\` ON \`registrations\` (\`user_id\`,\`event_id\`);`)
  await db.run(sql`CREATE TABLE \`orders\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` text NOT NULL,
  	\`registration_id\` integer NOT NULL,
  	\`amount\` numeric NOT NULL,
  	\`payment_method\` text DEFAULT 'upi',
  	\`payment_status\` text DEFAULT 'pending',
  	\`ddm_ticket_id\` text,
  	\`ddm_response\` text,
  	\`coupon_id\` integer,
  	\`discounted_amount\` numeric,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`registration_id\`) REFERENCES \`registrations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`coupon_id\`) REFERENCES \`coupons\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`orders_user_idx\` ON \`orders\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_registration_idx\` ON \`orders\` (\`registration_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_coupon_idx\` ON \`orders\` (\`coupon_id\`);`)
  await db.run(sql`CREATE INDEX \`orders_updated_at_idx\` ON \`orders\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`orders_payment_status_idx\` ON \`orders\` (\`payment_status\`);`)
  await db.run(sql`CREATE TABLE \`coupons\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`code\` text NOT NULL,
  	\`discount_type\` text NOT NULL,
  	\`discount_value\` numeric NOT NULL,
  	\`max_uses\` numeric,
  	\`used_count\` numeric DEFAULT 0,
  	\`expires_at\` text,
  	\`event_id\` integer,
  	\`is_active\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`coupons_code_idx\` ON \`coupons\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`coupons_event_idx\` ON \`coupons\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`coupons_updated_at_idx\` ON \`coupons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`coupons_created_at_idx\` ON \`coupons\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`users_id\` text,
  	\`societies_id\` integer,
  	\`execom_id\` integer,
  	\`events_id\` integer,
  	\`registrations_id\` integer,
  	\`orders_id\` integer,
  	\`coupons_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`societies_id\`) REFERENCES \`societies\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`execom_id\`) REFERENCES \`execom\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`registrations_id\`) REFERENCES \`registrations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`orders_id\`) REFERENCES \`orders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`coupons_id\`) REFERENCES \`coupons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_societies_id_idx\` ON \`payload_locked_documents_rels\` (\`societies_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_execom_id_idx\` ON \`payload_locked_documents_rels\` (\`execom_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_registrations_id_idx\` ON \`payload_locked_documents_rels\` (\`registrations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_orders_id_idx\` ON \`payload_locked_documents_rels\` (\`orders_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_coupons_id_idx\` ON \`payload_locked_documents_rels\` (\`coupons_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`users_teams\`;`)
  await db.run(sql`DROP TABLE \`users_accounts\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`societies\`;`)
  await db.run(sql`DROP TABLE \`societies_rels\`;`)
  await db.run(sql`DROP TABLE \`execom\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`DROP TABLE \`registrations\`;`)
  await db.run(sql`DROP TABLE \`orders\`;`)
  await db.run(sql`DROP TABLE \`coupons\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
}
