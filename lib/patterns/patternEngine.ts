import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { count, eq } from 'drizzle-orm';
import type { SalahName, PatternResult } from '@/types';

/**
 * Analyse logged data for a given Salah and return which reminder phase
 * the user is in, plus the top distraction if detectable.
 *
 * Phase rules (from PRD):
 *   Cold Start  — < 3 logs for this Salah
 *   Established — ≥ 3 logs with a detectable most-frequent distraction
 *
 * Patterns always use the user's complete Salah log history. Entitlement-based
 * display limits belong at the presentation layer and must not affect analysis.
 */
export async function getPatternForSalah(salahName: SalahName): Promise<PatternResult> {
  const specificLogs = await db
    .select()
    .from(salahLogs)
    .where(eq(salahLogs.salahName, salahName));

  const [{ total }] = await db
    .select({ total: count() })
    .from(salahLogs);

  const totalLogs = Number(total);
  const logCount = specificLogs.length;

  // ── Cold Start ───────────────────────────────────────────────────────────────
  if (logCount < 3) {
    return { phase: 'cold_start', topDistraction: null, frequency: 0, logCount, totalLogs };
  }

  // ── Count per-distraction frequency ─────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const log of specificLogs) {
    const keys = (log.distractions ?? '').split(',').filter(Boolean);
    for (const key of keys) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  // Find top distraction
  let topDistraction: string | null = null;
  let maxCount = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (n > maxCount) {
      maxCount = n;
      topDistraction = key;
    }
  }

  const frequency = topDistraction ? maxCount / logCount : 0;

  // ── Established ──────────────────────────────────────────────────────────────
  if (topDistraction) {
    return { phase: 'established', topDistraction, frequency, logCount, totalLogs };
  }

  return { phase: 'emerging', topDistraction, frequency, logCount, totalLogs };
}
