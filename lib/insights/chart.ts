import { rollingWindowStart, toLocalDateKey } from '../date';

export type ChartTimeframe = '7' | '30' | '90' | 'all';

export interface ChartLogRow {
  id: number;
  logDate: string;
  focusRating: number;
  loggedAt: number;
}

export interface ChartPoint {
  id: number;
  logDate: string;
  avg: number;
  logCount: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getChartDateBounds(timeframe: ChartTimeframe, now = new Date()) {
  const toDate = toLocalDateKey(now);
  const fromDate = timeframe === 'all' ? null : rollingWindowStart(Number(timeframe), now);
  return { fromDate, toDate };
}

/** Build one point per local calendar day using that day's mean focus rating. */
export function buildChartPoints(rows: ChartLogRow[]): ChartPoint[] {
  const pointsByDate = new Map<string, { id: number; sum: number; count: number }>();

  for (const row of [...rows].sort(
    (a, b) =>
      a.logDate.localeCompare(b.logDate) ||
      a.loggedAt - b.loggedAt ||
      a.id - b.id
  )) {
    const point = pointsByDate.get(row.logDate);
    if (point) {
      point.sum += row.focusRating;
      point.count += 1;
    } else {
      pointsByDate.set(row.logDate, { id: row.id, sum: row.focusRating, count: 1 });
    }
  }

  return Array.from(pointsByDate, ([logDate, point]) => ({
    id: point.id,
    logDate,
    avg: point.sum / point.count,
    logCount: point.count,
  }));
}

export function formatChartPointDate(logDate: string, timeframe: ChartTimeframe): string {
  const [year, month, day] = logDate.split('-').map(Number);
  const shortDate = `${MONTHS[month - 1]} ${day}`;

  if (timeframe === 'all') return `${shortDate} ${year}`;
  if (timeframe !== '7') return shortDate;

  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
