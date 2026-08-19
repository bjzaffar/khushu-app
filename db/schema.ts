import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── Salah Logs ──────────────────────────────────────────────────────────────
// One row per logged Salah reflection
export const salahLogs = sqliteTable('salah_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Which Salah: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
  salahName: text('salah_name').notNull(),
  // Focus rating 1–5
  focusRating: integer('focus_rating').notNull(),
  // Comma-separated distraction keys e.g. "work,financial,tired"
  distractions: text('distractions').notNull().default(''),
  // Optional user note (max 200 chars enforced in UI)
  reflectionText: text('reflection_text').default(''),
  // Unix timestamp (ms) of when the log was created
  loggedAt: integer('logged_at').notNull(),
  // ISO date string YYYY-MM-DD for easy day-grouping queries
  logDate: text('log_date').notNull(),
  // Whether this log was created via Salah Mode auto-flow
  fromSalahMode: integer('from_salah_mode', { mode: 'boolean' }).default(false),
  // Reminder type used for this prayer (short, attribute, ayah, hadith)
  reminderType: text('reminder_type'),
  // Classified category for custom distractions (mapped to a built-in key by AI)
  classifiedCategory: text('classified_category'),
});

// ─── Settings ─────────────────────────────────────────────────────────────────
// Key-value store for user preferences
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type SalahLog = typeof salahLogs.$inferSelect;
export type NewSalahLog = typeof salahLogs.$inferInsert;
