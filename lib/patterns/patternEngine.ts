import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { count, eq } from 'drizzle-orm';
import type { SalahName, DistractionKey, PatternResult } from '@/types';

/**
 * Analyse logged data for a given Salah and return which reminder phase
 * the user is in, plus the top distraction if detectable.
 *
 * Phase rules (from PRD):
 *   Cold Start  — < 3 logs for this Salah  OR  < 10 total logs
 *   Emerging    — ≥ 3 logs, top distraction < 40% frequency
 *   Established — ≥ 5 logs, top distraction ≥ 40% frequency
 */
export async function getPatternForSalah(salahName: SalahName): Promise<PatternResult> {
  const specificLogs = await db
    .select()
    .from(salahLogs)
    .where(eq(salahLogs.salahName, salahName));

  const [{ total }] = await db.select({ total: count() }).from(salahLogs);
  const totalLogs = Number(total);
  const logCount = specificLogs.length;

  // ── Cold Start ───────────────────────────────────────────────────────────────
  if (logCount < 3 || totalLogs < 10) {
    return { phase: 'cold_start', topDistraction: null, frequency: 0, logCount, totalLogs };
  }

  // ── Count per-distraction frequency ─────────────────────────────────────────
  const counts: Partial<Record<DistractionKey, number>> = {};
  for (const log of specificLogs) {
    const keys = (log.distractions ?? '').split(',').filter(Boolean) as DistractionKey[];
    for (const key of keys) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  // Find top distraction
  let topDistraction: DistractionKey | null = null;
  let maxCount = 0;
  for (const [key, n] of Object.entries(counts) as [DistractionKey, number][]) {
    if (n > maxCount) {
      maxCount = n;
      topDistraction = key;
    }
  }

  const frequency = topDistraction ? maxCount / logCount : 0;

  // ── Established ──────────────────────────────────────────────────────────────
  if (logCount >= 5 && frequency >= 0.4 && topDistraction) {
    return { phase: 'established', topDistraction, frequency, logCount, totalLogs };
  }

  // ── Emerging ─────────────────────────────────────────────────────────────────
  return { phase: 'emerging', topDistraction, frequency, logCount, totalLogs };
}
