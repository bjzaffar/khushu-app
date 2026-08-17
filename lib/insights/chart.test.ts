import { describe, expect, it } from 'vitest';
import { buildChartPoints, formatChartPointDate, getChartDateBounds } from './chart';

describe('insights chart data', () => {
  it('creates one chronological point per day using that day\'s average rating', () => {
    const points = buildChartPoints([
      { id: 2, logDate: '2026-08-11', focusRating: 4, loggedAt: 20 },
      { id: 1, logDate: '2026-08-04', focusRating: 3, loggedAt: 10 },
      { id: 3, logDate: '2026-08-11', focusRating: 5, loggedAt: 30 },
      { id: 4, logDate: '2026-08-04', focusRating: 5, loggedAt: 15 },
    ]);

    expect(points.map((point) => point.id)).toEqual([1, 2]);
    expect(points.map((point) => point.logDate)).toEqual(['2026-08-04', '2026-08-11']);
    expect(points.map((point) => point.avg)).toEqual([4, 4.5]);
    expect(points.map((point) => point.logCount)).toEqual([2, 2]);
  });

  it('uses inclusive local-calendar bounds ending today', () => {
    const now = new Date(2026, 7, 14, 0, 30);

    expect(getChartDateBounds('7', now)).toEqual({ fromDate: '2026-08-08', toDate: '2026-08-14' });
    expect(getChartDateBounds('30', now)).toEqual({ fromDate: '2026-07-16', toDate: '2026-08-14' });
    expect(getChartDateBounds('90', now)).toEqual({ fromDate: '2026-05-17', toDate: '2026-08-14' });
    expect(getChartDateBounds('all', now)).toEqual({ fromDate: null, toDate: '2026-08-14' });
  });

  it('formats only a selected point date, with a weekday in the 7-day view', () => {
    expect(formatChartPointDate('2026-08-13', '7')).toBe('Thursday');
    expect(formatChartPointDate('2026-08-13', '30')).toBe('Aug 13');
    expect(formatChartPointDate('2026-08-13', '90')).toBe('Aug 13');
    expect(formatChartPointDate('2026-08-13', 'all')).toBe('Aug 13 2026');
  });
});
