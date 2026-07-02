import { supabase } from './client';
import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Pull all salah_logs from Supabase for the current user and insert
 * any that don't already exist locally (deduped by logged_at + salah_name).
 */
export async function syncLogsFromCloud(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: rows, error } = await supabase
    .from('salah_logs')
    .select('salah_name, focus_rating, distractions, logged_at, log_date, from_salah_mode, reminder_type, classified_category')
    .eq('user_id', user.id);

  if (error || !rows) return;

  for (const row of rows) {
    const existing = db
      .select()
      .from(salahLogs)
      .where(
        eq(salahLogs.salahName, row.salah_name)
      )
      .all()
      .find((r) => r.loggedAt === row.logged_at);

    if (!existing) {
      db.insert(salahLogs).values({
        salahName: row.salah_name,
        focusRating: row.focus_rating,
        distractions: row.distractions ?? '',
        loggedAt: row.logged_at,
        logDate: row.log_date,
        fromSalahMode: row.from_salah_mode ?? false,
        reminderType: row.reminder_type,
        classifiedCategory: row.classified_category,
      }).run();
    }
  }
}
