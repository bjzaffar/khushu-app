import { eq } from 'drizzle-orm';
import { db } from '@/db/database';
import { settings } from '@/db/schema';

function debugPremiumOverrideKey(userId: string | null): string {
  return `debug_premium_override_${userId ?? 'anonymous'}`;
}

/** Local premium-access override used by the debug screen. */
export function readDebugPremiumOverride(userId: string | null): boolean {
  try {
    const setting = db
      .select()
      .from(settings)
      .where(eq(settings.key, debugPremiumOverrideKey(userId)))
      .get();
    return setting?.value === 'true';
  } catch {
    // Supabase may emit its initial auth event before SQLite is initialized.
    // Startup reloads the override after database initialization completes.
    return false;
  }
}

export function writeDebugPremiumOverride(userId: string | null, enabled: boolean): void {
  const key = debugPremiumOverrideKey(userId);
  if (!enabled) {
    db.delete(settings).where(eq(settings.key, key)).run();
    return;
  }

  db.insert(settings)
    .values({ key, value: 'true' })
    .onConflictDoUpdate({ target: settings.key, set: { value: 'true' } })
    .run();
}
