import { View, ScrollView, Modal, Pressable } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { ResponsiveContent } from '@/components/responsive/ResponsiveContent';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';
import { BookOpenIcon, LockClosedIcon } from 'react-native-heroicons/outline';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { avg, count, gte, lte, eq, and, asc, isNotNull } from 'drizzle-orm';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import { db } from '@/db/database';
import { salahLogs, settings } from '@/db/schema';
import {
  buildChartPoints as buildLogChartPoints,
  formatChartPointDate,
  getChartDateBounds,
  type ChartPoint as LogChartPoint,
  type ChartTimeframe,
} from '@/lib/insights/chart';
import {
  SALAH_NAMES,
  SALAH_DISPLAY_NAMES,
  DISTRACTION_LABELS,
  REMINDER_TYPE_LABELS,
  type SalahName,
  type DistractionKey,
  type ReminderType,
} from '@/types';
import { useThemeColors } from '@/lib/theme/colors';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalahInsight {
  salah: SalahName;
  displayName: string;
  topDistraction: { label: string; pct: number } | null;
  trend: string | null; // null = < 6 logs, omit sentence
}

interface ReminderEffectivenessEntry {
  type: ReminderType;
  label: string;
  avgRating: number;
  count: number;
}

interface InsightsData {
  totalLogs: number;
  weekLogs: number;
  salahAverages: Partial<Record<SalahName, number>>;
  topDistractions: { key: string; label: string; pct: number }[];
  salahInsights: SalahInsight[];
  reminderEffectiveness: ReminderEffectivenessEntry[];
}

// ── Colour tokens (raw values — NativeWind not available for inline styles) ──

function useInsightColors() {
  const theme = useThemeColors();
  return {
    sage: '#5A7A5A',
    sand100: theme.surfaceMuted,
    sand200: theme.borderStrong,
    ink300: '#9B9189',
    ink400: '#7D756D',
    ink700: theme.textSecondary,
    surface: theme.surface,
    white: '#FFFFFF',
  };
}

// ── Bar ───────────────────────────────────────────────────────────────────────

function Bar({ pct, height = 8 }: { pct: number; height?: number }) {
  const C = useInsightColors();
  const responsive = useResponsiveLayout();
  const scaledHeight = responsive.scaleControl(height);
  return (
    <View style={{ height: scaledHeight, backgroundColor: C.sand100, borderRadius: scaledHeight / 2 }}>
      <View
        style={{
          width: `${Math.max(2, pct)}%`,
          height: scaledHeight,
          backgroundColor: '#5A7A5A',
          borderRadius: scaledHeight / 2,
        }}
      />
    </View>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

const CHART_H = 120;
const PAD_V = 10; // room for the selection ring at ratings 1 and 5
const PAD_H = 10;
const Y_AXIS_W = 18;

function chartY(rating: number, chartHeight: number, verticalPadding: number): number {
  return verticalPadding + ((5 - rating) / 4) * (chartHeight - 2 * verticalPadding);
}

// ── computeSalahInsights ──────────────────────────────────────────────────────

function computeSalahInsights(
  allRows: { salahName: string; focusRating: number; distractions: string; loggedAt: number }[],
  labelMap: Record<string, string>
): SalahInsight[] {
  // Group rows by salah — rows are already in chronological order (asc loggedAt)
  const groups: Partial<Record<SalahName, typeof allRows>> = {};
  for (const row of allRows) {
    const key = row.salahName as SalahName;
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(row);
  }

  const results: SalahInsight[] = [];

  for (const salah of SALAH_NAMES) {
    const rows = groups[salah] ?? [];
    if (rows.length === 0) continue;

    // Top distraction
    const dCounts: Record<string, number> = {};
    let dTotal = 0;
    for (const row of rows) {
      const keys = (row.distractions ?? '').split(',').filter(Boolean);
      for (const k of keys) {
        dCounts[k] = (dCounts[k] ?? 0) + 1;
        dTotal++;
      }
    }
    let topKey: string | null = null;
    let topCount = 0;
    for (const [k, n] of Object.entries(dCounts)) {
      if (n > topCount) { topCount = n; topKey = k; }
    }
    const topDistraction = topKey
      ? {
          label: DISTRACTION_LABELS[topKey as DistractionKey] ?? labelMap[topKey] ?? 'Deleted distraction',
          pct: dTotal > 0 ? Math.round((topCount / dTotal) * 100) : 0,
        }
      : null;

    // Trend (requires ≥ 6 logs)
    let trend: string | null = null;
    if (rows.length >= 6) {
      const window = rows.slice(-10);
      const mid = Math.floor(window.length / 2);
      const earlier = window.slice(0, mid);
      const recent  = window.slice(mid);
      const avgRating = (arr: typeof rows) =>
        arr.reduce((s, r) => s + r.focusRating, 0) / arr.length;
      const delta = avgRating(recent) - avgRating(earlier);
      const name = SALAH_DISPLAY_NAMES[salah];
      if (delta >= 0.4) {
        trend = `Your ${name} khushu has been improving recently.`;
      } else if (delta <= -0.4) {
        trend = `Your ${name} khushu has been declining recently.`;
      } else {
        trend = `Your ${name} khushu has been fairly consistent.`;
      }
    }

    results.push({ salah, displayName: SALAH_DISPLAY_NAMES[salah], topDistraction, trend });
  }

  return results;
}

// ── KhushuChart ───────────────────────────────────────────────────────────────

function KhushuChart({
  points,
  timeframe,
  isAllSalah,
}: {
  points: LogChartPoint[];
  timeframe: ChartTimeframe;
  isAllSalah: boolean;
}) {
  const C = useInsightColors();
  const responsive = useResponsiveLayout();
  const [cw, setCw] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const chartHeight = responsive.scaleControl(CHART_H);
  const verticalPadding = responsive.scaleControl(PAD_V);
  const horizontalPadding = responsive.scaleSpacing(PAD_H);
  const yAxisWidth = responsive.scaleSpacing(Y_AXIS_W);
  const DOT = responsive.scaleControl(4);
  const HIT_SIZE = responsive.scaleControl(44);
  const RING_SIZE = responsive.scaleControl(14);
  const n = points.length;
  const selectedPoint = points.find((point) => point.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [isAllSalah, points, timeframe]);

  const getX = (i: number) =>
    n <= 1
      ? yAxisWidth + (cw - yAxisWidth) / 2
      : yAxisWidth + horizontalPadding + (i / (n - 1)) * (cw - yAxisWidth - 2 * horizontalPadding);

  if (n === 0) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <Text style={{ color: C.ink300, fontSize: 13 }}>No data in this period.</Text>
      </View>
    );
  }

  return (
    <View onLayout={(e) => setCw(e.nativeEvent.layout.width)}>
      {cw > 0 && (
        <>
          {/* Chart area */}
          <View style={{ height: chartHeight, position: 'relative' }}>
            {/* Grid lines at 1–5 */}
            {[1, 2, 3, 4, 5].map((v) => (
              <View
                key={v}
                style={{
                  position: 'absolute',
                  left: yAxisWidth,
                  right: 0,
                  top: chartY(v, chartHeight, verticalPadding),
                  height: 1,
                  backgroundColor: v === 3 ? C.sand200 : C.sand100,
                }}
              />
            ))}

            {/* Y-axis labels: 5, 3, 1 */}
            {[5, 3, 1].map((v) => (
              <Text
                key={v}
                style={{
                  position: 'absolute',
                  top: chartY(v, chartHeight, verticalPadding) - responsive.scaleControl(5),
                  left: 0,
                  width: yAxisWidth - responsive.scaleSpacing(5),
                  textAlign: 'right',
                  fontSize: 8,
                  lineHeight: 10,
                  color: C.ink300,
                }}
              >
                {v}
              </Text>
            ))}

            {selectedPoint && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: getX(points.indexOf(selectedPoint)) - 0.5,
                  top: 0,
                  width: 1,
                  height: chartHeight,
                  backgroundColor: 'rgba(90, 122, 90, 0.28)',
                }}
              />
            )}

            {/* Line segments */}
            {points.slice(0, -1).map((p, i) => {
              const x1 = getX(i),      y1 = chartY(p.avg, chartHeight, verticalPadding);
              const x2 = getX(i + 1),  y2 = chartY(points[i + 1].avg, chartHeight, verticalPadding);
              const dx = x2 - x1,      dy = y2 - y1;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: mx - length / 2,
                    top: my - 1,
                    width: length,
                    height: 2,
                    backgroundColor: C.sage,
                    transform: [{ rotate: `${angle}deg` }],
                  }}
                />
              );
            })}

            {/* Dots */}
            {points.map((point, i) => {
              const selected = point.id === selectedId;
              const dateLabel = formatChartPointDate(point.logDate, timeframe);
              const ratingLabel = isAllSalah
                ? `average khushu rating ${point.avg.toFixed(1)} out of 5 from ${point.logCount} ${point.logCount === 1 ? 'prayer' : 'prayers'}`
                : `khushu rating ${point.avg.toFixed(0)} out of 5`;
              return (
                <Pressable
                  key={point.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${dateLabel}, ${ratingLabel}`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedId(point.id)}
                  hitSlop={4}
                  style={{
                    position: 'absolute',
                    left: getX(i) - HIT_SIZE / 2,
                    top: chartY(point.avg, chartHeight, verticalPadding) - HIT_SIZE / 2,
                    width: HIT_SIZE,
                    height: HIT_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        width: RING_SIZE,
                        height: RING_SIZE,
                        borderRadius: RING_SIZE / 2,
                        borderWidth: 1,
                        borderColor: 'rgba(90, 122, 90, 0.48)',
                      }}
                    />
                  )}
                  <View
                    pointerEvents="none"
                    style={{
                      width: DOT * 2,
                      height: DOT * 2,
                      borderRadius: DOT,
                      backgroundColor: C.sage,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={{ height: responsive.scaleControl(28), marginTop: responsive.scaleSpacing(8), justifyContent: 'center' }}>
            {selectedPoint && (
              <Text
                style={{
                  color: C.sage,
                  fontSize: 15,
                  fontWeight: '500',
                  textAlign: 'center',
                }}
              >
                {formatChartPointDate(selectedPoint.logDate, timeframe)} • {isAllSalah
                  ? `${selectedPoint.avg.toFixed(1)} avg`
                  : selectedPoint.avg.toFixed(0)}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

function Dropdown<T extends string>({
  value,
  options,
  onChange,
  lockedValues,
  onLockedPress,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  lockedValues?: Set<T>;
  onLockedPress?: () => void;
}) {
  const C = useInsightColors();
  const responsive = useResponsiveLayout();
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: C.sand100,
          paddingHorizontal: responsive.scaleSpacing(14),
          paddingVertical: responsive.scaleSpacing(9),
          minHeight: responsive.isTablet ? responsive.scaleControl(44) : undefined,
          borderRadius: responsive.scaleControl(12),
        }}
      >
        <Text style={{ color: C.ink700, fontSize: 14, fontWeight: '500' }}>
          {currentLabel}
        </Text>
        <Text style={{ color: C.ink300, fontSize: 11 }}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: responsive.isTablet ? responsive.gutter : 24,
          }}
          onPress={() => setOpen(false)}
        >
          {/* Inner pressable prevents backdrop-tap from propagating through the list */}
          <Pressable
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: responsive.isTablet ? responsive.maxWidths.dialog : 384,
              shadowColor: '#1A1917',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.16,
              shadowRadius: 24,
              elevation: 12,
            }}
          >
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: C.sand200,
                overflow: 'hidden',
                width: '100%',
                paddingHorizontal: responsive.scaleSpacing(12),
                paddingVertical: responsive.scaleSpacing(8),
              }}
            >
              {options.map((opt, i) => {
                const selected = opt.value === value;
                const locked = lockedValues?.has(opt.value) ?? false;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      if (locked) {
                        setOpen(false);
                        onLockedPress?.();
                      } else {
                        onChange(opt.value);
                        setOpen(false);
                      }
                    }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? C.sand100 : 'transparent',
                      borderRadius: 12,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: responsive.scaleSpacing(16),
                        paddingVertical: responsive.scaleSpacing(16),
                        minHeight: responsive.isTablet ? responsive.scaleControl(52) : undefined,
                        borderBottomWidth: i < options.length - 1 ? 1 : 0,
                        borderBottomColor: C.sand100,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          color: locked ? C.ink300 : selected ? C.sage : C.ink700,
                          fontWeight: selected ? '600' : '400',
                          flex: 1,
                          marginRight: 16,
                        }}
                      >
                        {opt.label}
                      </Text>
                      {locked ? (
                        <LockClosedIcon size={14} color={C.ink700} />
                      ) : (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: selected ? C.sage : C.sand200,
                            backgroundColor: selected ? C.sage : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {selected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: C.white,
                              }}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── SalahInsightCard ──────────────────────────────────────────────────────────

function SalahInsightCard({ item, isLast }: { item: SalahInsight; isLast: boolean }) {
  const C = useInsightColors();
  const responsive = useResponsiveLayout();
  return (
    <View
      style={{
        paddingHorizontal: responsive.scaleSpacing(20),
        paddingVertical: responsive.scaleSpacing(14),
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: C.sand100,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: item.trend ? 5 : 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink700 }}>
          {item.displayName}
        </Text>
        {item.topDistraction ? (
          <Text style={{ fontSize: 12, color: C.ink400 }}>
            {item.topDistraction.label} · {item.topDistraction.pct}%
          </Text>
        ) : (
          <Text style={{ fontSize: 12, color: C.ink300 }}>No distractions logged</Text>
        )}
      </View>
      {item.trend && (
        <Text style={{ fontSize: 12, color: C.ink300, lineHeight: 18 }}>
          {item.trend}
        </Text>
      )}
    </View>
  );
}

// ── Option lists ──────────────────────────────────────────────────────────────

const SALAH_OPTIONS: { value: SalahName | 'all'; label: string }[] = [
  { value: 'all', label: 'All Salah' },
  ...SALAH_NAMES.map((n) => ({ value: n as SalahName | 'all', label: SALAH_DISPLAY_NAMES[n] })),
];

const TIMEFRAME_OPTIONS: { value: '7' | '30' | '90' | 'all'; label: string }[] = [
  { value: '7',   label: 'Last 7 days' },
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 3 months' },
  { value: 'all', label: 'All time' },
];

// ── InsightsScreen ────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const responsive = useResponsiveLayout();
  const C = useInsightColors();
  const isPremium = useAppStore(selectIsPremium);
  const [data, setData] = useState<InsightsData | null>(null);
  const [chartPoints, setChartPoints] = useState<LogChartPoint[]>([]);
  const [salahFilter, setSalahFilter] = useState<SalahName | 'all'>('all');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('7');

  // Always-fresh ref so the useFocusEffect stable callback can read current filter values
  const filtersRef = useRef({ salahFilter, timeframe });
  filtersRef.current = { salahFilter, timeframe };

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  function loadChartData(filter: SalahName | 'all', tf: ChartTimeframe) {
    const { fromDate, toDate } = getChartDateBounds(tf);
    const fields = {
      id: salahLogs.id,
      logDate: salahLogs.logDate,
      focusRating: salahLogs.focusRating,
      loggedAt: salahLogs.loggedAt,
    };

    const rows = fromDate
      ? filter === 'all'
        ? db.select(fields).from(salahLogs).where(and(gte(salahLogs.logDate, fromDate), lte(salahLogs.logDate, toDate))).all()
        : db.select(fields).from(salahLogs).where(and(gte(salahLogs.logDate, fromDate), lte(salahLogs.logDate, toDate), eq(salahLogs.salahName, filter))).all()
      : filter === 'all'
        ? db.select(fields).from(salahLogs).where(lte(salahLogs.logDate, toDate)).all()
        : db.select(fields).from(salahLogs).where(and(lte(salahLogs.logDate, toDate), eq(salahLogs.salahName, filter))).all();

    setChartPoints(buildLogChartPoints(rows));
  }

  function loadData() {
    const { fromDate, toDate: today } = getChartDateBounds('7');
    const sevenDaysAgo = fromDate ?? today;
    // Always use 7-day window for averages
    const avgWindowDaysAgo = sevenDaysAgo;
    // The empty-state threshold reflects complete history for every tier.
    const totalRow = db.select({ n: count() }).from(salahLogs).get();
    const totalLogs = totalRow?.n ?? 0;

    const weekRow = db
      .select({ n: count() })
      .from(salahLogs)
      .where(and(gte(salahLogs.logDate, sevenDaysAgo), lte(salahLogs.logDate, today)))
      .get();
    const weekLogs = weekRow?.n ?? 0;

    const avgRows = db
      .select({ salahName: salahLogs.salahName, avgRating: avg(salahLogs.focusRating) })
      .from(salahLogs)
      .where(and(gte(salahLogs.logDate, avgWindowDaysAgo), lte(salahLogs.logDate, today)))
      .groupBy(salahLogs.salahName)
      .all();

    const salahAverages: Partial<Record<SalahName, number>> = {};
    for (const row of avgRows) {
      if (row.avgRating !== null) {
        salahAverages[row.salahName as SalahName] = parseFloat(String(row.avgRating));
      }
    }

    // Insight patterns use complete history for every tier. Only the chart's
    // selectable date range is entitlement-limited.
    const allRows = db
      .select({
        salahName: salahLogs.salahName,
        focusRating: salahLogs.focusRating,
        distractions: salahLogs.distractions,
        loggedAt: salahLogs.loggedAt,
      })
      .from(salahLogs)
      .orderBy(asc(salahLogs.loggedAt))
      .all();

    const dCounts: Record<string, number> = {};
    let dTotal = 0;
    for (const row of allRows) {
      const keys = (row.distractions ?? '').split(',').filter(Boolean);
      for (const k of keys) {
        dCounts[k] = (dCounts[k] ?? 0) + 1;
        dTotal++;
      }
    }

    const customLabelMap: Record<string, string> = {};
    const customRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'custom_distractions'))
      .get();
    if (customRow) {
      try {
        const list = JSON.parse(customRow.value) as { key: string; label: string }[];
        for (const d of list) customLabelMap[d.key] = d.label;
      } catch {}
    }

    const deletedLabelMap: Record<string, string> = {};
    const deletedRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'deleted_custom_distractions'))
      .get();
    if (deletedRow) {
      try {
        const list = JSON.parse(deletedRow.value) as { key: string; label: string }[];
        for (const d of list) deletedLabelMap[d.key] = d.label;
      } catch {}
    }

    const historicalLabelMap: Record<string, string> = {};
    const historicalRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'historical_custom_labels'))
      .get();
    if (historicalRow) {
      try {
        const list = JSON.parse(historicalRow.value) as { key: string; label: string }[];
        for (const d of list) historicalLabelMap[d.key] = d.label;
      } catch {}
    }

    const labelMap: Record<string, string> = {};
    const labelRegistryRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'custom_distraction_labels'))
      .get();
    if (labelRegistryRow) {
      try {
        const list = JSON.parse(labelRegistryRow.value) as { key: string; label: string }[];
        for (const d of list) labelMap[d.key] = d.label;
      } catch {}
    }

    Object.assign(labelMap, historicalLabelMap, deletedLabelMap, customLabelMap);

    const topDistractions = (Object.entries(dCounts) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, n]) => ({
        key,
        label: DISTRACTION_LABELS[key as DistractionKey] ?? labelMap[key] ?? 'Deleted distraction',
        pct: dTotal > 0 ? Math.round((n / dTotal) * 100) : 0,
      }));

    const salahInsights = computeSalahInsights(allRows, labelMap);

    // Reminder effectiveness — all-time, all users (data collected regardless of tier)
    const effectRows = db
      .select({
        reminderType: salahLogs.reminderType,
        avgRating: avg(salahLogs.focusRating),
        sampleCount: count(),
      })
      .from(salahLogs)
      .where(isNotNull(salahLogs.reminderType))
      .groupBy(salahLogs.reminderType)
      .all();

    const reminderEffectiveness: ReminderEffectivenessEntry[] = effectRows
      .filter((r) => r.reminderType && r.reminderType !== 'ai' && Number(r.sampleCount) >= 3)
      .map((r) => ({
        type: r.reminderType as ReminderType,
        label: REMINDER_TYPE_LABELS[r.reminderType as ReminderType] ?? r.reminderType ?? '',
        avgRating: parseFloat(String(r.avgRating ?? 0)),
        count: Number(r.sampleCount),
      }))
      .sort((a, b) => b.avgRating - a.avgRating);

    setData({ totalLogs, weekLogs, salahAverages, topDistractions, salahInsights, reminderEffectiveness });
  }

  // Reload stats + chart whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });

      loadData();
      const { salahFilter: f, timeframe: tf } = filtersRef.current;
      loadChartData(f, tf);
    }, [])
  );

  // Reload chart when filters change
  useEffect(() => {
    loadChartData(salahFilter, timeframe);
  }, [salahFilter, timeframe]);

  const isEmpty = !data || data.totalLogs < 3;

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingTop: responsive.scaleSpacing(24),
          paddingBottom: responsive.scaleSpacing(40),
        }}
      >
        <ResponsiveContent>
        <Text className="text-2xl font-semibold text-ink-900 mb-6">Insights</Text>

        {isEmpty ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-6 items-center gap-y-3">
            <BookOpenIcon size={30} color={C.sage} />
            <Text className="text-ink-700 font-medium text-base text-center">
              Not enough data yet
            </Text>
            <Text className="text-ink-300 text-sm text-center leading-relaxed">
              Log at least 3 Salah reflections to start seeing your patterns here.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Khushu Over Time ───────────────────────────────────────────── */}
            <View className="mb-6">
              <View className="bg-white rounded-2xl border border-sand-200 px-4 pt-4 pb-2">
                <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                  Khushu Over Time
                </Text>
                <View className="flex-row items-center justify-between mb-4">
                  <Dropdown
                    value={salahFilter}
                    options={SALAH_OPTIONS}
                    onChange={setSalahFilter}
                  />
                  <Dropdown
                    value={timeframe}
                    options={TIMEFRAME_OPTIONS}
                    onChange={setTimeframe}
                    lockedValues={isPremium ? undefined : new Set<'7' | '30' | '90' | 'all'>(['30', '90', 'all'])}
                    onLockedPress={() => router.push('/paywall')}
                  />
                </View>
                <KhushuChart
                  points={chartPoints}
                  timeframe={timeframe}
                  isAllSalah={salahFilter === 'all'}
                />
              </View>
            </View>

            {/* ── This Week ──────────────────────────────────────────────────── */}
            <View className="mb-6">
              <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                This Week
              </Text>
              <View className="bg-white rounded-2xl border border-sand-200 px-5 py-4">
                <View className="flex-row items-center gap-x-3 mb-2">
                  <View className="flex-1">
                    <Bar pct={((data?.weekLogs ?? 0) / 35) * 100} height={10} />
                  </View>
                  <Text className="text-ink-700 font-semibold text-sm w-16 text-right">
                    {data?.weekLogs ?? 0} / 35
                  </Text>
                </View>
                <Text className="text-ink-300 text-xs">
                  prayers logged in the last 7 days
                </Text>
              </View>
            </View>

            {/* ── Focus by Salah ─────────────────────────────────────────────── */}
            <View className="mb-6">
              <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                Focus by Salah in the last week
              </Text>
              <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
                {SALAH_NAMES.map((name, i) => {
                  const avgVal = data?.salahAverages[name];
                  const pct = avgVal ? (avgVal / 5) * 100 : 0;
                  return (
                    <View
                      key={name}
                      className={`px-5 py-3 ${
                        i < SALAH_NAMES.length - 1 ? 'border-b border-sand-100' : ''
                      }`}
                    >
                      <View className="flex-row items-center gap-x-3">
                        <Text className="text-ink-700 text-sm font-medium w-16">
                          {SALAH_DISPLAY_NAMES[name]}
                        </Text>
                        <View className="flex-1">
                          <Bar pct={pct} height={10} />
                        </View>
                        <Text className="text-ink-300 text-xs w-8 text-right">
                          {avgVal ? avgVal.toFixed(1) : '—'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── Common Distractions ────────────────────────────────────────── */}
            {(data?.topDistractions.length ?? 0) > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                  Common Distractions
                </Text>
                <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
                  {data!.topDistractions.map((d, i) => (
                    <View
                      key={d.key}
                      className={`px-5 py-3 ${
                        i < data!.topDistractions.length - 1
                          ? 'border-b border-sand-100'
                          : ''
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-1.5">
                        <Text className="text-ink-700 text-sm font-medium">{d.label}</Text>
                        <Text className="text-ink-300 text-xs">{d.pct}%</Text>
                      </View>
                      <Bar pct={d.pct} height={6} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── By Salah ───────────────────────────────────────────────────── */}
            {isPremium ? (
              (data?.salahInsights.length ?? 0) > 0 && (
                <View className="mb-6">
                  <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                    Top Distraction by Salah
                  </Text>
                  <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
                    {data!.salahInsights.map((item, i) => (
                      <SalahInsightCard
                        key={item.salah}
                        item={item}
                        isLast={i === data!.salahInsights.length - 1}
                      />
                    ))}
                  </View>
                </View>
              )
            ) : (
              <Pressable onPress={() => router.push('/paywall')} className="mb-6 active:opacity-80">
                <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                  Top Distraction by Salah
                </Text>
                <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
                  {SALAH_NAMES.map((salah, i) => (
                    <View
                      key={salah}
                      style={{
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        borderBottomWidth: i < SALAH_NAMES.length - 1 ? 1 : 0,
                        borderBottomColor: C.sand100,
                        opacity: 0.35,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink700 }}>
                          {SALAH_DISPLAY_NAMES[salah]}
                        </Text>
                        <View style={{ width: 80, height: 14, backgroundColor: C.sand200, borderRadius: 4 }} />
                      </View>
                      <View style={{ width: 140, height: 12, backgroundColor: C.sand100, borderRadius: 4, marginTop: 6 }} />
                    </View>
                  ))}
                  <View style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <LockClosedIcon size={18} color={C.ink700} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink700 }}>Premium</Text>
                    <Text style={{ fontSize: 12, color: C.ink300 }}>Tap to unlock per-prayer insights</Text>
                  </View>
                </View>
              </Pressable>
            )}

            {/* ── Reminder Effectiveness ─────────────────────────────────────── */}
            <View className="mb-6">
              <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-3">
                What works for you (BETA)
              </Text>
                {(data?.reminderEffectiveness.length ?? 0) === 0 ? (
                  <View className="bg-white rounded-2xl border border-sand-200 px-5 py-5">
                    <Text style={{ fontSize: 13, color: C.ink300, lineHeight: 20 }}>
                      After you&apos;ve received a few reminders and logged those prayers, you&apos;ll see which reminder styles lead to your best focus.
                    </Text>
                  </View>
                ) : (
                  <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden">
                    {data!.reminderEffectiveness.map((entry, i) => {
                      const pct = ((entry.avgRating - 1) / 4) * 100;
                      const isFirst = i === 0;
                      return (
                        <View
                          key={entry.type}
                          style={{
                            paddingHorizontal: 20,
                            paddingVertical: 14,
                            borderBottomWidth: i < data!.reminderEffectiveness.length - 1 ? 1 : 0,
                            borderBottomColor: C.sand100,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: isFirst ? C.sage : C.ink700 }}>
                                {entry.label}
                              </Text>
                              {isFirst && (
                                <View style={{ backgroundColor: C.sage, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 10, color: C.white, fontWeight: '600' }}>Best</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 12, color: C.ink300 }}>
                              {entry.avgRating.toFixed(1)} · {entry.count} prayers
                            </Text>
                          </View>
                          <Bar pct={pct} height={6} />
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
        )}
        </ResponsiveContent>
      </ScrollView>
    </SafeAreaView>
  );
}
