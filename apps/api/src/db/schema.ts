/**
 * Database schema for Tab.Flow API.
 * Uses Drizzle ORM with PostgreSQL + pgvector for AI embeddings.
 */
import { pgTable, uuid, text, timestamp, integer, jsonb, real, index, varchar } from 'drizzle-orm/pg-core';
// Note: userId columns intentionally have no FK to users — they store Cognito subs directly.

// ---- Users ----
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    cognitoSub: varchar('cognito_sub', { length: 255 }).unique().notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---- Workspaces (cloud-synced) ----
export const workspaces = pgTable('workspaces', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    tabs: jsonb('tabs').notNull().$type<{ url: string; title: string; faviconUrl?: string }[]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('workspaces_user_idx').on(table.userId),
]);

// ---- Bookmarks (cloud-synced) ----
export const bookmarks = pgTable('bookmarks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    url: text('url').notNull(),
    title: varchar('title', { length: 512 }).notNull(),
    faviconUrl: text('favicon_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('bookmarks_user_idx').on(table.userId),
]);

// ---- Notes (cloud-synced) ----
export const notes = pgTable('notes', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    url: text('url').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('notes_user_idx').on(table.userId),
]);

// ---- Tab Embeddings (for semantic search) ----
// The 'embedding' column stores 768-dim vectors from Gemini as real[].
// Vector operations (cosine similarity) are done via raw SQL.
export const tabEmbeddings = pgTable('tab_embeddings', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    url: text('url').notNull(),
    title: varchar('title', { length: 512 }).notNull(),
    contentSummary: text('content_summary'),
    embedding: real('embedding').array().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    index('embeddings_user_idx').on(table.userId),
]);

// ---- Tab Analytics ----
export const tabAnalytics = pgTable('tab_analytics', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    url: text('url').notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    title: varchar('title', { length: 512 }),
    visitCount: integer('visit_count').default(0).notNull(),
    totalDurationMs: integer('total_duration_ms').default(0).notNull(),
    lastVisitedAt: timestamp('last_visited_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    index('analytics_user_idx').on(table.userId),
    index('analytics_domain_idx').on(table.domain),
]);

// ---- User Settings (cloud-synced) ----
export const userSettings = pgTable('user_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').unique().notNull(),
    settings: jsonb('settings').notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
