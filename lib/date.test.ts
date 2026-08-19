import { describe, expect, it } from 'vitest';
import { formatLongLocalDate, shiftLocalDate, toLocalDateKey } from './date';

describe('local calendar date helpers', () => {
  it('formats long dates without punctuation', () => {
    const date = new Date(2026, 7, 19, 12);
    expect(formatLongLocalDate(date)).toBe('Wednesday August 19');
  });

  it('moves one local calendar day at a time', () => {
    const date = new Date(2026, 0, 1, 12);
    expect(toLocalDateKey(shiftLocalDate(date, -1))).toBe('2025-12-31');
    expect(toLocalDateKey(shiftLocalDate(date, 1))).toBe('2026-01-02');
  });
});
