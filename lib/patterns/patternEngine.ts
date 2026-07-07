import { db } from '@/db/database';
import { salahLogs } from '@/db/schema';
import { count, eq, and, gte } from 'drizzle-orm';
import type { SalahName, PatternResult } from '@/types';

function daysAgoDateStr(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

/**
 * Analyse logged data for a given Salah and return which reminder phase
 * the user is in, plus the top distraction if detectable.
 *
 * Phase rules (from PRD):
 *   Cold Start  — < 3 logs for this Salah  OR  < 10 total logs
 *   Emerging    — ≥ 3 logs, top distraction < 40% frequency
 *   Established — ≥ 5 logs, top distraction ≥ 40% frequency
 *
 * dayLimit — if set, only logs from the last N days are considered (free tier = 7).
 *            Pass undefined for no limit (premium).
 */
export async function getPatternForSalah(salahName: SalahName, dayLimit?: number): Promise<PatternResult> {
  const dateFilter = dayLimit ? daysAgoDateStr(dayLimit) : null;

  const specificLogs = await db
    .select()
    .from(salahLogs)
    .where(
      dateFilter
        ? and(eq(salahLogs.salahName, salahName), gte(salahLogs.logDate, dateFilter))
        : eq(salahLogs.salahName, salahName)
    );

  const [{ total }] = await db
    .select({ total: count() })
    .from(salahLogs)
    .where(dateFilter ? gte(salahLogs.logDate, dateFilter) : undefined);

  const totalLogs = Number(total);
  const logCount = specificLogs.length;

  // ── Cold Start ───────────────────────────────────────────────────────────────
  if (logCount < 3 || totalLogs < 10) {
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
  if (logCount >= 5 && frequency >= 0.4 && topDistraction) {
    return { phase: 'established', topDistraction, frequency, logCount, totalLogs };
  }

  return { phase: 'emerging', topDistraction, frequency, logCount, totalLogs };
}
