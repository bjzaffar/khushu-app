import { eq } from 'drizzle-orm';
import { db } from '@/db/database';
import { settings } from '@/db/schema';

export interface CustomDistraction {
  key: string;
  label: string;
}

function readList(key: string): CustomDistraction[] {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return [];
  try {
    const value = JSON.parse(row.value);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: CustomDistraction[]) {
  db.insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
    .run();
}

/**
 * Removes active custom distractions from the logging UI while preserving their
 * labels in the archive and label registry. Historical salah_logs are never
 * modified, so Insights can continue to resolve their original labels.
 */
export function archiveActiveCustomDistractions(): boolean {
  const active = readList('custom_distractions');
  if (active.length === 0) return false;

  const archive = readList('deleted_custom_distractions');
  const labelRegistry = readList('custom_distraction_labels');
  const archivedKeys = new Set(archive.map((item) => item.key));
  const knownKeys = new Set(labelRegistry.map((item) => item.key));

  for (const distraction of active) {
    if (!archivedKeys.has(distraction.key)) archive.push(distraction);
    if (!knownKeys.has(distraction.key)) labelRegistry.push(distraction);
  }

  writeList('custom_distractions', []);
  writeList('deleted_custom_distractions', archive);
  writeList('custom_distraction_labels', labelRegistry);
  return true;
}
