import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// Singleton SQLite connection
const sqlite = SQLite.openDatabaseSync('khushu.db');
export const db = drizzle(sqlite, { schema });

/**
 * Run on app startup. Creates tables if they don't exist.
 * Using raw SQL for the initial migration — no migration runner needed at MVP scale.
 */
export async function initDatabase(): Promise<void> {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS salah_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salah_name TEXT NOT NULL,
      focus_rating INTEGER NOT NULL,
      distractions TEXT NOT NULL DEFAULT '',
      reflection_text TEXT DEFAULT '',
      logged_at INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      from_salah_mode INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export { schema };
