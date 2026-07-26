import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    philosopherId: text("philosopher_id").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    workType: text("work_type").notNull().default("book"),
    originalLanguage: text("original_language"),
    firstPublishedYear: integer("first_published_year"),
    sourceTier: text("source_tier").notNull().default("P1"),
    rightsStatus: text("rights_status").notNull().default("unknown"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("works_philosopher_status_idx").on(
      table.philosopherId,
      table.status,
    ),
  ],
);

export const editions = sqliteTable(
  "editions",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    language: text("language").notNull(),
    translator: text("translator"),
    editor: text("editor"),
    publisher: text("publisher"),
    publishedYear: integer("published_year"),
    isbn: text("isbn"),
    sourceUrl: text("source_url"),
    rightsStatus: text("rights_status").notNull().default("unknown"),
    licenseNote: text("license_note"),
    r2Key: text("r2_key"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    fileSha256: text("file_sha256"),
    fileSize: integer("file_size"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("editions_work_status_idx").on(table.workId, table.status),
    uniqueIndex("editions_r2_key_unique").on(table.r2Key),
  ],
);

export const passages = sqliteTable(
  "passages",
  {
    id: text("id").primaryKey(),
    editionId: text("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    locator: text("locator").notNull(),
    citationLabel: text("citation_label"),
    originalText: text("original_text"),
    translationText: text("translation_text"),
    interpretiveNote: text("interpretive_note").notNull(),
    searchText: text("search_text").notNull(),
    themesJson: text("themes_json").notNull().default("[]"),
    kind: text("kind").notNull().default("doctrine"),
    evidenceClass: text("evidence_class").notNull().default("P1"),
    agentUse: text("agent_use")
      .notNull()
      .default("QUALIFIED_FIRST_PERSON"),
    period: text("period"),
    claimIdsJson: text("claim_ids_json").notNull().default("[]"),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("passages_edition_sequence_unique").on(
      table.editionId,
      table.sequence,
    ),
    index("passages_edition_status_idx").on(table.editionId, table.status),
    index("passages_kind_priority_idx").on(table.kind, table.priority),
  ],
);

export type WorkRow = typeof works.$inferSelect;
export type EditionRow = typeof editions.$inferSelect;
export type PassageRow = typeof passages.$inferSelect;
