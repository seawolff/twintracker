import { computeAnalytics } from './analytics';
import type { TrackerEvent, EventType } from '../types/index';

const NOW = new Date('2024-03-15T14:00:00Z'); // Friday 2pm UTC

let idSeq = 0;
function makeEvent(
  babyId: string,
  type: EventType,
  startedAt: string,
  extra: Partial<TrackerEvent> = {},
): TrackerEvent {
  return { id: String(++idSeq), babyId, type, startedAt, createdAt: startedAt, ...extra };
}

function daysAgo(d: number, hour = 12): string {
  const dt = new Date(NOW);
  dt.setUTCDate(dt.getUTCDate() - d);
  dt.setUTCHours(hour, 0, 0, 0);
  return dt.toISOString();
}

function makeNap(dAgo: number, durMin: number, type: EventType = 'nap'): TrackerEvent {
  const start = new Date(daysAgo(dAgo));
  const end = new Date(start.getTime() + durMin * 60_000);
  return makeEvent('b1', type, start.toISOString(), { endedAt: end.toISOString() });
}

describe('computeAnalytics', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  test('empty events returns zeroed analytics', () => {
    const a = computeAnalytics([], NOW, 0);
    expect(a.totalOzThisWeek).toBe(0);
    expect(a.diaperCountThisWeek).toBe(0);
    expect(a.avgOzPerFeed).toBeNull();
    expect(a.napCountThisWeek).toBe(0);
    expect(a.totalNapMsThisWeek).toBe(0);
    expect(a.nightSleepCountThisWeek).toBe(0);
    expect(a.totalNightSleepMsThisWeek).toBe(0);
    expect(a.milestones).toHaveLength(0);
  });

  test('totalOzThisWeek sums bottle values', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(2), { value: 5 }),
      makeEvent('b1', 'bottle', daysAgo(8), { value: 6 }), // older than 1 week — excluded
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.totalOzThisWeek).toBe(9);
  });

  test('avgOzPerFeed is median of bottle oz values', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 3 }),
      makeEvent('b1', 'bottle', daysAgo(2), { value: 5 }),
      makeEvent('b1', 'bottle', daysAgo(3), { value: 4 }),
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.avgOzPerFeed).toBe(4);
  });

  // ── Naps ──────────────────────────────────────────────────────────────────────

  test('napCountThisWeek and totalNapMsThisWeek sum completed daytime naps', () => {
    const events = [makeNap(1, 90), makeNap(2, 60)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.napCountThisWeek).toBe(2);
    expect(a.totalNapMsThisWeek).toBe(150 * 60_000);
    expect(a.totalSleepMsThisWeek).toBe(150 * 60_000);
  });

  test('naps older than 1 week are excluded', () => {
    const events = [makeNap(1, 60), makeNap(8, 90)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.napCountThisWeek).toBe(1);
    expect(a.totalNapMsThisWeek).toBe(60 * 60_000);
  });

  test('avgNapDurationMs is median of completed nap durations', () => {
    const events = [makeNap(1, 60), makeNap(2, 90), makeNap(3, 120)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.avgNapDurationMs).toBe(90 * 60_000);
  });

  test('longestNapMs returns the maximum nap duration', () => {
    const events = [makeNap(1, 60), makeNap(2, 120), makeNap(3, 45)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.longestNapMs).toBe(120 * 60_000);
  });

  test('naps shorter than 5 min are excluded from nap stats', () => {
    const events = [makeNap(1, 3), makeNap(2, 60)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.napCountThisWeek).toBe(1);
    expect(a.totalNapMsThisWeek).toBe(60 * 60_000);
  });

  // ── Night sleep ───────────────────────────────────────────────────────────────

  test('nightSleepCountThisWeek and totalNightSleepMsThisWeek sum completed sleep events', () => {
    const events = [makeNap(1, 480, 'sleep'), makeNap(2, 420, 'sleep')];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.nightSleepCountThisWeek).toBe(2);
    expect(a.totalNightSleepMsThisWeek).toBe(900 * 60_000);
    expect(a.napCountThisWeek).toBe(0);
  });

  test('avgNightSleepDurationMs is median of completed night sleep durations', () => {
    const events = [makeNap(1, 420, 'sleep'), makeNap(2, 480, 'sleep'), makeNap(3, 360, 'sleep')];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.avgNightSleepDurationMs).toBe(420 * 60_000);
  });

  test('nap and sleep events are counted independently', () => {
    const events = [makeNap(1, 90), makeNap(1, 480, 'sleep')];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.napCountThisWeek).toBe(1);
    expect(a.nightSleepCountThisWeek).toBe(1);
    expect(a.totalSleepMsThisWeek).toBe((90 + 480) * 60_000);
  });

  // ── Combined sleep delta ───────────────────────────────────────────────────────

  test('sleepDeltaVsLastWeek is positive when more sleep this week', () => {
    const events = [
      makeNap(1, 120), // this week nap: 120m
      makeNap(8, 60), // last week nap: 60m
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.sleepDeltaVsLastWeek).toBe(60 * 60_000);
  });

  test('sleepDeltaVsLastWeek includes both nap and night sleep', () => {
    const events = [
      makeNap(1, 90), // this week nap: 90m
      makeNap(1, 480, 'sleep'), // this week night: 480m → total 570m
      makeNap(8, 60), // last week nap: 60m
      makeNap(9, 420, 'sleep'), // last week night: 420m → total 480m
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.sleepDeltaVsLastWeek).toBe(90 * 60_000); // 570 - 480
  });

  test('sleepDeltaVsLastWeek is null when no last-week sleep data', () => {
    const events = [makeNap(1, 90)];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.sleepDeltaVsLastWeek).toBeNull();
  });

  // ── Sleep attribution by endedAt ──────────────────────────────────────────────

  test('sleep starting before the 7-day window but ending inside it counts in this period', () => {
    // startedAt is 9 days ago at UTC noon — definitely before the 7-day boundary regardless of timezone.
    // endedAt is 6 days ago at UTC noon — definitely inside the 7-day window in any timezone.
    // The sleep duration (72h) exceeds the 5-min minimum, so it should be counted.
    const startedAt = daysAgo(9, 12);
    const endedAt = daysAgo(6, 12);
    const crossBoundary = makeEvent('b1', 'sleep', startedAt, { endedAt });
    const a = computeAnalytics([crossBoundary], NOW, 0);
    expect(a.nightSleepCountThisWeek).toBe(1);
  });

  test('sleep that starts inside the window but has no endedAt is excluded', () => {
    const ongoing = makeEvent('b1', 'sleep', daysAgo(1));
    const a = computeAnalytics([ongoing], NOW, 0);
    expect(a.nightSleepCountThisWeek).toBe(0);
  });

  // ── Other ─────────────────────────────────────────────────────────────────────

  test('diaperCountThisWeek counts diaper events', () => {
    const events = [
      makeEvent('b1', 'diaper', daysAgo(1)),
      makeEvent('b1', 'diaper', daysAgo(2)),
      makeEvent('b1', 'diaper', daysAgo(2)),
      makeEvent('b1', 'diaper', daysAgo(9)), // excluded
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.diaperCountThisWeek).toBe(3);
  });

  test('milestones returns all milestone events sorted newest first', () => {
    const events = [
      makeEvent('b1', 'milestone', daysAgo(20), { notes: 'First smile' }),
      makeEvent('b1', 'milestone', daysAgo(5), { notes: 'First steps' }),
      makeEvent('b1', 'milestone', daysAgo(30), { notes: 'First word' }),
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.milestones).toHaveLength(3);
    expect(a.milestones[0].notes).toBe('First steps');
    expect(a.milestones[2].notes).toBe('First word');
  });

  test('foodCountThisWeek counts food events', () => {
    const events = [
      makeEvent('b1', 'food', daysAgo(1), { notes: 'banana' }),
      makeEvent('b1', 'food', daysAgo(2), { notes: 'oatmeal' }),
      makeEvent('b1', 'food', daysAgo(10), { notes: 'old food' }), // excluded
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.foodCountThisWeek).toBe(2);
  });

  test('avgFeedsPerDay counts bottle and nursing over daysInPeriod', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(2), { value: 5 }),
      makeEvent('b1', 'nursing', daysAgo(3)),
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.totalFeeds).toBe(3);
    expect(a.avgFeedsPerDay).toBeCloseTo(3 / a.daysInPeriod, 5);
  });

  test('avgDailySleepMs combines nap and night sleep over daysInPeriod', () => {
    const napMs = 60 * 60_000; // 1h nap
    const sleepMs = 8 * 60 * 60_000; // 8h night sleep
    const napStart = new Date(daysAgo(2));
    const napEnd = new Date(napStart.getTime() + napMs);
    const sleepStart = new Date(daysAgo(1));
    const sleepEnd = new Date(sleepStart.getTime() + sleepMs);
    const events: TrackerEvent[] = [
      makeEvent('b1', 'nap', napStart.toISOString(), { endedAt: napEnd.toISOString() }),
      makeEvent('b1', 'sleep', sleepStart.toISOString(), { endedAt: sleepEnd.toISOString() }),
    ];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.totalSleepMsThisWeek).toBe(napMs + sleepMs);
    expect(a.avgDailySleepMs).toBeCloseTo((napMs + sleepMs) / a.daysInPeriod, 5);
  });

  test('targetDailySleepMs returns age-appropriate range', () => {
    // newborn (born today relative to real clock) → 14–18h
    const newbornBirthDate = new Date(Date.now()).toISOString().slice(0, 10);
    const a0 = computeAnalytics([], NOW, 0, 'week', newbornBirthDate);
    expect(a0.targetDailySleepMs.minMs).toBe(14 * 60 * 60_000);
    expect(a0.targetDailySleepMs.maxMs).toBe(18 * 60 * 60_000);
  });

  test('msSinceLastDirty finds most recent dirty or both diaper across all events', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'diaper', daysAgo(1), { notes: 'wet' }),
      makeEvent('b1', 'diaper', daysAgo(0), { notes: 'dirty' }), // most recent dirty
      makeEvent('b1', 'diaper', daysAgo(10), { notes: 'both' }), // older, should not win
    ];
    const a = computeAnalytics(events, NOW, 0);
    // msSinceLastDirty should be ~0 days (just logged)
    expect(a.msSinceLastDirty).not.toBeNull();
    expect(a.msSinceLastDirty!).toBeLessThan(24 * 60 * 60_000);
  });

  test('msSinceLastDirty is null when no dirty or both diapers logged', () => {
    const events: TrackerEvent[] = [makeEvent('b1', 'diaper', daysAgo(1), { notes: 'wet' })];
    const a = computeAnalytics(events, NOW, 0);
    expect(a.msSinceLastDirty).toBeNull();
  });

  test('selfSoothingWaitMs reflects age-appropriate wait', () => {
    const newbornBirthDate = new Date(Date.now()).toISOString().slice(0, 10);
    const a = computeAnalytics([], NOW, 0, 'week', newbornBirthDate);
    // 0 weeks → getSelfSoothingMinutes returns 5 min
    expect(a.selfSoothingWaitMs).toBe(5 * 60_000);
  });

  test('dataSpanDays is 0 when no events in period', () => {
    const a = computeAnalytics([], NOW, 0);
    expect(a.dataSpanDays).toBe(0);
  });

  test('dataSpanDays reflects earliest event in period', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(3), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
    ];
    const a = computeAnalytics(events, NOW, 0);
    // earliest event is 3 days ago, so dataSpanDays ≈ 3
    expect(a.dataSpanDays).toBeGreaterThan(2.9);
    expect(a.dataSpanDays).toBeLessThanOrEqual(7);
  });

  test('dataSpanDays is capped at periodDays', () => {
    // event older than the period should not extend dataSpanDays beyond periodDays
    const events: TrackerEvent[] = [makeEvent('b1', 'bottle', daysAgo(1), { value: 4 })];
    const a = computeAnalytics(events, NOW, 0, 'day');
    expect(a.dataSpanDays).toBeLessThanOrEqual(1);
  });

  test('targetMinWetDiapersPerDay is 6 for newborn, null after 13 weeks', () => {
    // birthDate relative to real clock (getAgeWeeks uses Date.now())
    const newbornBirthDate = new Date(Date.now()).toISOString().slice(0, 10);
    const a0 = computeAnalytics([], NOW, 0, 'week', newbornBirthDate);
    expect(a0.targetMinWetDiapersPerDay).toBe(6);

    const olderMs = Date.now() - 14 * 7 * 24 * 60 * 60_000;
    const olderDate = new Date(olderMs).toISOString().slice(0, 10);
    const a14 = computeAnalytics([], NOW, 0, 'week', olderDate);
    expect(a14.targetMinWetDiapersPerDay).toBeNull();
  });
});
