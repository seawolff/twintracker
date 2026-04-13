import { computeLearnedStats } from './learnedSchedule';
import type { TrackerEvent, EventType } from '../types/index';

const NOW = new Date('2024-03-15T12:00:00Z');

let idSeq = 0;
function makeEvent(
  babyId: string,
  type: EventType,
  startedAt: string,
  extra: Partial<TrackerEvent> = {},
): TrackerEvent {
  return {
    id: String(++idSeq),
    babyId,
    type,
    startedAt,
    createdAt: startedAt,
    ...extra,
  };
}

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

describe('computeLearnedStats', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  test('empty events → all null', () => {
    const stats = computeLearnedStats([], NOW);
    expect(stats.avgFeedIntervalMs).toBeNull();
    expect(stats.avgBottleOz).toBeNull();
    expect(stats.avgNapDurationMs).toBeNull();
    expect(stats.avgAwakeWindowMs).toBeNull();
    expect(stats.avgNapsPerDay).toBeNull();
  });

  test('< 3 data points → all null', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(6), { value: 4 }),
      makeEvent('b1', 'bottle', hoursAgo(3), { value: 5 }),
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgFeedIntervalMs).toBeNull(); // only 1 interval
    expect(stats.avgBottleOz).toBeNull(); // only 2 data points
  });

  test('bottle events: correct median feed interval', () => {
    // Intervals: 3h, 3h, 4h, 3h → sorted [3,3,3,4] → median = 3h
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(13)),
      makeEvent('b1', 'bottle', hoursAgo(10)),
      makeEvent('b1', 'bottle', hoursAgo(7)),
      makeEvent('b1', 'bottle', hoursAgo(3)),
      makeEvent('b1', 'bottle', hoursAgo(0)),
    ];
    const stats = computeLearnedStats(events, NOW);
    // 4 intervals: 3h,3h,4h,3h (sorted: 3,3,3,4) median = 3h
    expect(stats.avgFeedIntervalMs).toBeCloseTo(3 * 3_600_000, -5);
  });

  test('nursing events count toward feed interval', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(12)),
      makeEvent('b1', 'nursing', hoursAgo(9)),
      makeEvent('b1', 'bottle', hoursAgo(6)),
      makeEvent('b1', 'nursing', hoursAgo(3)),
      makeEvent('b1', 'bottle', hoursAgo(0)),
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgFeedIntervalMs).toBeCloseTo(3 * 3_600_000, -5);
  });

  test('bottle oz: correct median', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(12), { value: 3 }),
      makeEvent('b1', 'bottle', hoursAgo(9), { value: 4 }),
      makeEvent('b1', 'bottle', hoursAgo(6), { value: 4 }),
      makeEvent('b1', 'bottle', hoursAgo(3), { value: 5 }),
      makeEvent('b1', 'bottle', hoursAgo(0), { value: 4 }),
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgBottleOz).toBe(4); // sorted [3,4,4,4,5] → median index 2 = 4
  });

  test('completed naps: correct median duration', () => {
    // Nap durations: 60m, 90m, 90m, 120m → median = 90m
    const mkNap = (startHoursAgo: number, durMin: number) =>
      makeEvent('b1', 'nap', hoursAgo(startHoursAgo), {
        endedAt: new Date(
          NOW.getTime() - startHoursAgo * 3_600_000 + durMin * 60_000,
        ).toISOString(),
      });
    const events = [mkNap(24, 60), mkNap(16, 90), mkNap(8, 90), mkNap(2, 120)];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgNapDurationMs).toBe(90 * 60_000);
  });

  test('awake window computed from nap pairs', () => {
    // nap ends → next nap starts: gaps of 2h, 2h, 3h → median 2h
    const mkNap = (startIso: string, endIso: string) =>
      makeEvent('b1', 'nap', startIso, { endedAt: endIso });
    const d = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
    const events = [
      mkNap(d(24), d(22.5)), // ends at 22.5h ago
      mkNap(d(20.5), d(19)), // starts 20.5h ago (2h awake), ends 19h ago
      mkNap(d(17), d(15.5)), // starts 17h ago (2h awake), ends 15.5h ago
      mkNap(d(12.5), d(11)), // starts 12.5h ago (3h awake), ends 11h ago
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgAwakeWindowMs).toBe(2 * 3_600_000);
  });

  test('events older than 14 days are excluded', () => {
    const oldDate = new Date(NOW.getTime() - 15 * 24 * 3_600_000).toISOString();
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', oldDate, { value: 4 }),
      makeEvent('b1', 'bottle', oldDate, { value: 5 }),
      makeEvent('b1', 'bottle', oldDate, { value: 4 }),
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgBottleOz).toBeNull();
  });

  test('bottle values above 16 oz are excluded from avgBottleOz', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(12), { value: 4 }),
      makeEvent('b1', 'bottle', hoursAgo(9), { value: 5 }),
      makeEvent('b1', 'bottle', hoursAgo(6), { value: 33 }), // accidental outlier
      makeEvent('b1', 'bottle', hoursAgo(3), { value: 5 }),
      makeEvent('b1', 'bottle', hoursAgo(0), { value: 4 }),
    ];
    const stats = computeLearnedStats(events, NOW);
    // Only [4, 5, 5, 4] count (33 excluded) → sorted [4, 4, 5, 5] → median = 4.5
    expect(stats.avgBottleOz).toBe(4.5);
  });

  test('bottle values arriving as strings (pg NUMERIC) are coerced to numbers correctly', () => {
    // The pg library returns NUMERIC columns as strings at runtime.
    // String concatenation "5" + "5" = "55" → 55/2 = 27.5 was the bug.
    const events = [
      makeEvent('b1', 'bottle', hoursAgo(12), { value: '4' as unknown as number }),
      makeEvent('b1', 'bottle', hoursAgo(9), { value: '5' as unknown as number }),
      makeEvent('b1', 'bottle', hoursAgo(6), { value: '5' as unknown as number }),
      makeEvent('b1', 'bottle', hoursAgo(3), { value: '5' as unknown as number }),
      makeEvent('b1', 'bottle', hoursAgo(0), { value: '6' as unknown as number }),
    ];
    const stats = computeLearnedStats(events, NOW);
    // sorted [4,5,5,5,6] → median index 2 = 5, not some string-concatenation artifact
    expect(stats.avgBottleOz).toBe(5);
  });

  test('all-outlier bottle values return null (not enough valid data points)', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', hoursAgo(6), { value: 33 }),
      makeEvent('b1', 'bottle', hoursAgo(3), { value: 50 }),
    ];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgBottleOz).toBeNull(); // 0 valid values < minimum 3
  });

  test('avgNapsPerDay: median naps per calendar day', () => {
    // Day keys (UTC ms / 86400000):
    // hoursAgo(48) → 2 days ago, hoursAgo(46) → 2 days ago = 2 naps that day
    // hoursAgo(24) → 1 day ago = 1 nap
    // hoursAgo(2) → today = 1 nap
    // naps per day: [2, 1, 1] → sorted [1, 1, 2] → median = 1
    const mkNap = (startHoursAgo: number, durMin: number) =>
      makeEvent('b1', 'nap', hoursAgo(startHoursAgo), {
        endedAt: new Date(
          NOW.getTime() - startHoursAgo * 3_600_000 + durMin * 60_000,
        ).toISOString(),
      });
    const events = [mkNap(48, 60), mkNap(46, 45), mkNap(24, 90), mkNap(2, 60)];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgNapsPerDay).toBe(1);
  });

  test('avgNapsPerDay: null when fewer than 3 days of data', () => {
    const mkNap = (startHoursAgo: number) =>
      makeEvent('b1', 'nap', hoursAgo(startHoursAgo), {
        endedAt: new Date(NOW.getTime() - startHoursAgo * 3_600_000 + 60 * 60_000).toISOString(),
      });
    // Only 2 distinct days
    const events = [mkNap(24), mkNap(2)];
    const stats = computeLearnedStats(events, NOW);
    expect(stats.avgNapsPerDay).toBeNull();
  });
});
