import {
  computeAnalytics,
  computeTrendData,
  detectTransitionSignals,
  TREND_DAYS,
} from './analytics';
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
    const a = computeAnalytics([], NOW);
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
    const a = computeAnalytics(events, NOW);
    expect(a.totalOzThisWeek).toBe(9);
  });

  test('totalOzThisWeek converts ml-unit bottle events to oz before summing', () => {
    const ML_PER_OZ = 29.5735;
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 120, unit: 'ml' }), // ≈ 4.058 oz
      makeEvent('b1', 'bottle', daysAgo(2), { value: 4, unit: 'oz' }), // 4 oz exactly
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.totalOzThisWeek).toBeCloseTo(120 / ML_PER_OZ + 4, 3);
  });

  test('totalPumpedOzThisWeek converts ml-unit pump events to oz', () => {
    const ML_PER_OZ = 29.5735;
    const events: TrackerEvent[] = [
      makeEvent('b1', 'pump', daysAgo(1), { value: 150, unit: 'ml' }), // ≈ 5.07 oz
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.totalPumpedOzThisWeek).toBeCloseTo(150 / ML_PER_OZ, 3);
  });

  test('pumping totals and lactation balance are tracked separately from bottle intake', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 5, notes: 'source=formula' }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4, notes: 'source=fridge' }),
      makeEvent('b1', 'pump', daysAgo(1), { value: 7 }),
      makeEvent('b1', 'pump', daysAgo(2), { value: 3 }),
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.totalOzThisWeek).toBe(9);
    expect(a.totalPumpedOzThisWeek).toBe(10);
    expect(a.lactationBalanceOzThisWeek).toBe(6);
    expect(a.avgPumpedOzPerDay).toBeCloseTo(10 / a.daysInPeriod, 5);
  });

  test('nursing sessions count as feeds but do not reduce lactation balance', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'nursing', daysAgo(1), { value: 20, notes: 'left' }),
      makeEvent('b1', 'pump', daysAgo(1), { value: 8 }),
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.totalFeeds).toBe(1);
    expect(a.totalPumpedOzThisWeek).toBe(8);
    expect(a.lactationBalanceOzThisWeek).toBe(8);
  });

  test('avgOzPerFeed is median of bottle oz values', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 3 }),
      makeEvent('b1', 'bottle', daysAgo(2), { value: 5 }),
      makeEvent('b1', 'bottle', daysAgo(3), { value: 4 }),
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.avgOzPerFeed).toBe(4);
  });

  // ── Naps ──────────────────────────────────────────────────────────────────────

  test('napCountThisWeek and totalNapMsThisWeek sum completed daytime naps', () => {
    const events = [makeNap(1, 90), makeNap(2, 60)];
    const a = computeAnalytics(events, NOW);
    expect(a.napCountThisWeek).toBe(2);
    expect(a.totalNapMsThisWeek).toBe(150 * 60_000);
    expect(a.totalSleepMsThisWeek).toBe(150 * 60_000);
  });

  test('naps older than 1 week are excluded', () => {
    const events = [makeNap(1, 60), makeNap(8, 90)];
    const a = computeAnalytics(events, NOW);
    expect(a.napCountThisWeek).toBe(1);
    expect(a.totalNapMsThisWeek).toBe(60 * 60_000);
  });

  test('avgNapDurationMs is median of completed nap durations', () => {
    const events = [makeNap(1, 60), makeNap(2, 90), makeNap(3, 120)];
    const a = computeAnalytics(events, NOW);
    expect(a.avgNapDurationMs).toBe(90 * 60_000);
  });

  test('longestNapMs returns the maximum nap duration', () => {
    const events = [makeNap(1, 60), makeNap(2, 120), makeNap(3, 45)];
    const a = computeAnalytics(events, NOW);
    expect(a.longestNapMs).toBe(120 * 60_000);
  });

  test('naps shorter than 5 min are excluded from nap stats', () => {
    const events = [makeNap(1, 3), makeNap(2, 60)];
    const a = computeAnalytics(events, NOW);
    expect(a.napCountThisWeek).toBe(1);
    expect(a.totalNapMsThisWeek).toBe(60 * 60_000);
  });

  // ── Night sleep ───────────────────────────────────────────────────────────────

  test('nightSleepCountThisWeek and totalNightSleepMsThisWeek sum completed sleep events', () => {
    const events = [makeNap(1, 480, 'sleep'), makeNap(2, 420, 'sleep')];
    const a = computeAnalytics(events, NOW);
    expect(a.nightSleepCountThisWeek).toBe(2);
    expect(a.totalNightSleepMsThisWeek).toBe(900 * 60_000);
    expect(a.napCountThisWeek).toBe(0);
  });

  test('avgNightSleepDurationMs is median of completed night sleep durations', () => {
    const events = [makeNap(1, 420, 'sleep'), makeNap(2, 480, 'sleep'), makeNap(3, 360, 'sleep')];
    const a = computeAnalytics(events, NOW);
    expect(a.avgNightSleepDurationMs).toBe(420 * 60_000);
  });

  test('nap and sleep events are counted independently', () => {
    const events = [makeNap(1, 90), makeNap(1, 480, 'sleep')];
    const a = computeAnalytics(events, NOW);
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
    const a = computeAnalytics(events, NOW);
    expect(a.sleepDeltaVsLastWeek).toBe(60 * 60_000);
  });

  test('sleepDeltaVsLastWeek includes both nap and night sleep', () => {
    const events = [
      makeNap(1, 90), // this week nap: 90m
      makeNap(1, 480, 'sleep'), // this week night: 480m → total 570m
      makeNap(8, 60), // last week nap: 60m
      makeNap(9, 420, 'sleep'), // last week night: 420m → total 480m
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.sleepDeltaVsLastWeek).toBe(90 * 60_000); // 570 - 480
  });

  test('sleepDeltaVsLastWeek is null when no last-week sleep data', () => {
    const events = [makeNap(1, 90)];
    const a = computeAnalytics(events, NOW);
    expect(a.sleepDeltaVsLastWeek).toBeNull();
  });

  // ── Nap avg-duration delta ────────────────────────────────────────────────────

  test('napDeltaVsLastWeek is positive when avg nap is longer this week', () => {
    const events = [
      makeNap(1, 90), // this week: 90m avg
      makeNap(8, 60), // last week: 60m avg
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.napDeltaVsLastWeek).toBe(30 * 60_000); // +30m
  });

  test('napDeltaVsLastWeek is negative when avg nap is shorter this week', () => {
    const events = [
      makeNap(1, 45), // this week: 45m avg
      makeNap(8, 90), // last week: 90m avg
    ];
    const a = computeAnalytics(events, NOW);
    expect(a.napDeltaVsLastWeek).toBe(-45 * 60_000); // −45m
  });

  test('napDeltaVsLastWeek is null when no last-week nap data', () => {
    const events = [makeNap(1, 60)];
    const a = computeAnalytics(events, NOW);
    expect(a.napDeltaVsLastWeek).toBeNull();
  });

  test('napDeltaVsLastWeek is null when no this-week nap data', () => {
    const events = [makeNap(8, 60)];
    const a = computeAnalytics(events, NOW);
    expect(a.napDeltaVsLastWeek).toBeNull();
  });

  // ── Sleep attribution by endedAt ──────────────────────────────────────────────

  test('sleep starting before the 7-day window but ending inside it counts in this period', () => {
    // startedAt is 9 days ago at UTC noon — definitely before the 7-day boundary regardless of timezone.
    // endedAt is 6 days ago at UTC noon — definitely inside the 7-day window in any timezone.
    // The sleep duration (72h) exceeds the 5-min minimum, so it should be counted.
    const startedAt = daysAgo(9, 12);
    const endedAt = daysAgo(6, 12);
    const crossBoundary = makeEvent('b1', 'sleep', startedAt, { endedAt });
    const a = computeAnalytics([crossBoundary], NOW);
    expect(a.nightSleepCountThisWeek).toBe(1);
  });

  test('sleep total clamps pre-window hours — a cross-boundary sleep only contributes in-window time to the total', () => {
    // Sleep started 2h before the 7-day window boundary and ended 1h after it.
    // Full duration = 3h; only 1h falls inside the window.
    const windowStart = new Date(NOW);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - 7);
    const startedAt = new Date(windowStart.getTime() - 2 * 3_600_000).toISOString(); // 2h before
    const endedAt = new Date(windowStart.getTime() + 1 * 3_600_000).toISOString(); // 1h after
    const cross = makeEvent('b1', 'sleep', startedAt, { endedAt });
    const a = computeAnalytics([cross], NOW);
    // Total should be 1h (clamped), not 3h (full).
    expect(a.totalNightSleepMsThisWeek).toBeCloseTo(1 * 3_600_000, -4);
    // But the individual duration for avg is the full 3h (event quality, not period overlap).
    expect(a.avgNightSleepDurationMs).toBeCloseTo(3 * 3_600_000, -4);
  });

  test('sleepDeltaVsLastWeek is not inflated by cross-boundary sleeps', () => {
    // Both weeks have one ~8h night sleep that starts 30min before the window boundary.
    // Without clamping, both weeks count ~8h (so delta ≈ 0). With clamping, both weeks
    // count ~7.5h and the delta is still ≈ 0 — the key is they match, not inflate one side.
    const makeNight = (daysAgoStart: number) => {
      const startMs = new Date(NOW).setDate(new Date(NOW).getDate() - daysAgoStart) - 30 * 60_000;
      const endMs = startMs + 8 * 3_600_000;
      return makeEvent('b1', 'sleep', new Date(startMs).toISOString(), {
        endedAt: new Date(endMs).toISOString(),
      });
    };
    // One sleep in this week, one in last week.
    const events = [makeNight(3), makeNight(10)];
    const a = computeAnalytics(events, NOW);
    // Delta should be close to 0 — both weeks have equivalent clamped totals.
    expect(Math.abs(a.sleepDeltaVsLastWeek ?? Infinity)).toBeLessThan(5 * 60_000); // within 5 min
  });

  test('sleep that starts inside the window but has no endedAt is excluded', () => {
    const ongoing = makeEvent('b1', 'sleep', daysAgo(1));
    const a = computeAnalytics([ongoing], NOW);
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
    const a = computeAnalytics(events, NOW);
    expect(a.diaperCountThisWeek).toBe(3);
  });

  test('milestones returns all milestone events sorted newest first', () => {
    const events = [
      makeEvent('b1', 'milestone', daysAgo(20), { notes: 'First smile' }),
      makeEvent('b1', 'milestone', daysAgo(5), { notes: 'First steps' }),
      makeEvent('b1', 'milestone', daysAgo(30), { notes: 'First word' }),
    ];
    const a = computeAnalytics(events, NOW);
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
    const a = computeAnalytics(events, NOW);
    expect(a.foodCountThisWeek).toBe(2);
  });

  test('avgFeedsPerDay counts bottle and nursing over daysInPeriod', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(2), { value: 5 }),
      makeEvent('b1', 'nursing', daysAgo(3)),
    ];
    const a = computeAnalytics(events, NOW);
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
    const a = computeAnalytics(events, NOW);
    expect(a.totalSleepMsThisWeek).toBe(napMs + sleepMs);
    expect(a.avgDailySleepMs).toBeCloseTo((napMs + sleepMs) / a.daysInPeriod, 5);
  });

  test('targetDailySleepMs returns age-appropriate range', () => {
    // newborn (born today relative to real clock) → 14–18h
    const newbornBirthDate = new Date(Date.now()).toISOString().slice(0, 10);
    const a0 = computeAnalytics([], NOW, 'week', newbornBirthDate);
    expect(a0.targetDailySleepMs.minMs).toBe(14 * 60 * 60_000);
    expect(a0.targetDailySleepMs.maxMs).toBe(18 * 60 * 60_000);
  });

  test('msSinceLastDirty finds most recent dirty or both diaper across all events', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'diaper', daysAgo(1), { notes: 'wet' }),
      makeEvent('b1', 'diaper', daysAgo(0), { notes: 'dirty' }), // most recent dirty
      makeEvent('b1', 'diaper', daysAgo(10), { notes: 'both' }), // older, should not win
    ];
    const a = computeAnalytics(events, NOW);
    // msSinceLastDirty should be ~0 days (just logged)
    expect(a.msSinceLastDirty).not.toBeNull();
    expect(a.msSinceLastDirty!).toBeLessThan(24 * 60 * 60_000);
  });

  test('msSinceLastDirty is null when no dirty or both diapers logged', () => {
    const events: TrackerEvent[] = [makeEvent('b1', 'diaper', daysAgo(1), { notes: 'wet' })];
    const a = computeAnalytics(events, NOW);
    expect(a.msSinceLastDirty).toBeNull();
  });

  test('selfSoothingWaitMs reflects age-appropriate wait', () => {
    const newbornBirthDate = new Date(Date.now()).toISOString().slice(0, 10);
    const a = computeAnalytics([], NOW, 'week', newbornBirthDate);
    // 0 weeks → getSelfSoothingMinutes returns 5 min
    expect(a.selfSoothingWaitMs).toBe(5 * 60_000);
  });

  test('dataSpanDays is 0 when no events in period', () => {
    const a = computeAnalytics([], NOW);
    expect(a.dataSpanDays).toBe(0);
  });

  test('dataSpanDays reflects earliest event in period', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(3), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
    ];
    const a = computeAnalytics(events, NOW);
    // earliest event is 3 days ago, so dataSpanDays ≈ 3
    expect(a.dataSpanDays).toBeGreaterThan(2.9);
    expect(a.dataSpanDays).toBeLessThanOrEqual(7);
  });

  test('dataSpanDays is capped at periodDays', () => {
    // event older than the period should not extend dataSpanDays beyond periodDays
    const events: TrackerEvent[] = [makeEvent('b1', 'bottle', daysAgo(1), { value: 4 })];
    const a = computeAnalytics(events, NOW, 'day');
    expect(a.dataSpanDays).toBeLessThanOrEqual(1);
  });

  test('day period starts exactly at midnight and excludes prior-day events', () => {
    const localMidnight = new Date(NOW);
    localMidnight.setHours(0, 0, 0, 0);
    const justBeforeMidnightAtLocalBoundary = new Date(localMidnight.getTime() - 60_000);
    const justAfterMidnightAtLocalBoundary = new Date(localMidnight.getTime() + 60_000);
    const morningPump = new Date(localMidnight.getTime() + 3 * 60 * 60_000);

    const justBeforeMidnight = makeEvent(
      'b1',
      'bottle',
      justBeforeMidnightAtLocalBoundary.toISOString(),
      { value: 4.2 },
    );
    const justAfterMidnight = makeEvent(
      'b1',
      'bottle',
      justAfterMidnightAtLocalBoundary.toISOString(),
      { value: 5.25 },
    );
    const pumpEvent = makeEvent('b1', 'pump', morningPump.toISOString(), { value: 3.75 });

    const a = computeAnalytics([justBeforeMidnight, justAfterMidnight, pumpEvent], NOW, 'day');

    expect(a.totalOzThisWeek).toBe(5.25);
    expect(a.totalPumpedOzThisWeek).toBe(3.75);
    expect(a.totalFeeds).toBe(1);
  });

  test('targetMinWetDiapersPerDay is 6 for newborn >= 4 days old, null before day 4, null after 13 weeks', () => {
    // < 4 days old: colostrum phase — threshold not yet applicable (AAP)
    const day2Ms = Date.now() - 2 * 24 * 60 * 60_000;
    const day2Date = new Date(day2Ms).toISOString().slice(0, 10);
    expect(computeAnalytics([], NOW, 'week', day2Date).targetMinWetDiapersPerDay).toBeNull();

    // Exactly 4 days old: threshold applies
    const day4Ms = Date.now() - 4 * 24 * 60 * 60_000;
    const day4Date = new Date(day4Ms).toISOString().slice(0, 10);
    expect(computeAnalytics([], NOW, 'week', day4Date).targetMinWetDiapersPerDay).toBe(6);

    // 4 weeks old: still a newborn — threshold applies
    const week4Ms = Date.now() - 4 * 7 * 24 * 60 * 60_000;
    const week4Date = new Date(week4Ms).toISOString().slice(0, 10);
    expect(computeAnalytics([], NOW, 'week', week4Date).targetMinWetDiapersPerDay).toBe(6);

    // 14 weeks old: past tracking window — null
    const week14Ms = Date.now() - 14 * 7 * 24 * 60 * 60_000;
    const week14Date = new Date(week14Ms).toISOString().slice(0, 10);
    expect(computeAnalytics([], NOW, 'week', week14Date).targetMinWetDiapersPerDay).toBeNull();
  });
});

// ── computeTrendData ──────────────────────────────────────────────────────────

describe('computeTrendData', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  test(`returns ${TREND_DAYS} points for each series`, () => {
    const td = computeTrendData([], NOW);
    expect(td.feedIntervalByDay).toHaveLength(TREND_DAYS);
    expect(td.ozPerFeedByDay).toHaveLength(TREND_DAYS);
    expect(td.ozPerDayByDay).toHaveLength(TREND_DAYS);
    expect(td.pumpedOzPerDay).toHaveLength(TREND_DAYS);
    expect(td.solidMealsByDay).toHaveLength(TREND_DAYS);
    expect(td.weaningCrossoverByDay).toHaveLength(TREND_DAYS);
    expect(td.milkBalanceByDay).toHaveLength(TREND_DAYS);
    expect(td.napCountByDay).toHaveLength(TREND_DAYS);
    expect(td.longestNightByDay).toHaveLength(TREND_DAYS);
  });

  test('all values are null when no events logged', () => {
    const td = computeTrendData([], NOW);
    td.feedIntervalByDay.forEach(p => expect(p.value).toBeNull());
    td.ozPerDayByDay.forEach(p => expect(p.value).toBeNull());
    td.pumpedOzPerDay.forEach(p => expect(p.value).toBeNull());
    td.solidMealsByDay.forEach(p => expect(p.value).toBeNull());
    td.weaningCrossoverByDay.forEach(p => {
      expect(p.bottleShare).toBeNull();
      expect(p.solidsShare).toBeNull();
    });
    td.napCountByDay.forEach(p => expect(p.value).toBeNull());
  });

  test('points are ordered oldest first (ascending dayMs)', () => {
    const td = computeTrendData([], NOW);
    for (let i = 1; i < TREND_DAYS; i++) {
      expect(td.feedIntervalByDay[i].dayMs).toBeGreaterThan(td.feedIntervalByDay[i - 1].dayMs);
    }
  });

  test('bottle oz is summed per day in ozPerDayByDay', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 5 }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 6 }),
    ];
    const td = computeTrendData(events, NOW);
    // daysAgo(1) = yesterday → slot index TREND_DAYS - 2
    const yestPoint = td.ozPerDayByDay[TREND_DAYS - 2];
    expect(yestPoint.value).toBeCloseTo(11, 1);
  });

  test('pump oz is summed per day and milk balance subtracts breastmilk bottle intake only', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4, notes: 'source=fridge' }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 3, notes: 'source=formula' }),
      makeEvent('b1', 'pump', daysAgo(1), { value: 7 }),
      makeEvent('b1', 'pump', daysAgo(1), { value: 3 }),
    ];
    const td = computeTrendData(events, NOW);
    const yesterdayPump = td.pumpedOzPerDay[TREND_DAYS - 2];
    const yesterdayBalance = td.milkBalanceByDay[TREND_DAYS - 2];
    expect(yesterdayPump.value).toBe(10);
    expect(yesterdayBalance.value).toBe(6);
  });

  test('ozPerFeedByDay averages oz per bottle within a day', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1), { value: 4 }),
      makeEvent('b1', 'bottle', daysAgo(1), { value: 6 }),
    ];
    const td = computeTrendData(events, NOW);
    // yesterday's slot is index TREND_DAYS - 2
    const yestPoint = td.ozPerFeedByDay[TREND_DAYS - 2];
    expect(yestPoint.value).toBeCloseTo(5, 1);
  });

  test('solidMealsByDay counts food logs and weaning crossover normalizes bottles vs solids', () => {
    const events: TrackerEvent[] = [
      makeEvent('b1', 'bottle', daysAgo(1, 8), { value: 6 }),
      makeEvent('b1', 'bottle', daysAgo(1, 12), { value: 6 }),
      makeEvent('b1', 'food', daysAgo(1, 9), { notes: 'banana' }),
      makeEvent('b1', 'food', daysAgo(1, 13), { notes: 'oatmeal' }),
    ];
    const td = computeTrendData(events, NOW);
    const yestMeals = td.solidMealsByDay[TREND_DAYS - 2];
    const yestCrossover = td.weaningCrossoverByDay[TREND_DAYS - 2];
    expect(yestMeals.value).toBe(2);
    expect(yestCrossover.bottleOz).toBe(12);
    expect(yestCrossover.solidMeals).toBe(2);
    expect(yestCrossover.bottleShare).not.toBeNull();
    expect(yestCrossover.solidsShare).not.toBeNull();
    expect((yestCrossover.bottleShare ?? 0) + (yestCrossover.solidsShare ?? 0)).toBeCloseTo(1, 5);
    expect(yestCrossover.solidsShare ?? 0).toBeGreaterThan(0);
  });

  test('napCountByDay counts completed naps per day', () => {
    const events: TrackerEvent[] = [makeNap(1, 60), makeNap(1, 90), makeNap(2, 45)];
    const td = computeTrendData(events, NOW);
    const yesterdayNaps = td.napCountByDay[TREND_DAYS - 2];
    expect(yesterdayNaps.value).toBe(2);
  });

  test('longestNightByDay picks the max sleep duration per day', () => {
    const short = makeNap(1, 240, 'sleep'); // 4h
    const long = makeNap(1, 480, 'sleep'); // 8h
    const td = computeTrendData([short, long], NOW);
    const yesterdayNight = td.longestNightByDay[TREND_DAYS - 2];
    expect(yesterdayNight.value).toBeCloseTo(480 * 60_000, -3);
  });

  test('targetOzPerDay and targetFeedIntervalMs are positive numbers', () => {
    const td = computeTrendData([], NOW);
    expect(td.targetOzPerDay).toBeGreaterThan(0);
    expect(td.targetFeedIntervalMs).toBeGreaterThan(0);
  });

  test('events older than TREND_DAYS are excluded', () => {
    const old = makeEvent('b1', 'bottle', daysAgo(TREND_DAYS + 2), { value: 6 });
    const recent = makeEvent('b1', 'bottle', daysAgo(1), { value: 5 });
    const td = computeTrendData([old, recent], NOW);
    // No oz in the oldest slot
    expect(td.ozPerDayByDay[0].value).toBeNull();
    // Recent slot has oz
    expect(td.ozPerDayByDay[TREND_DAYS - 2]?.value).toBeCloseTo(5, 1);
  });
});

// ── detectTransitionSignals ───────────────────────────────────────────────────

describe('detectTransitionSignals', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  test('returns empty array when no events', () => {
    expect(detectTransitionSignals([], NOW)).toHaveLength(0);
  });

  test('detects feed_interval_lengthening when recent gaps are >15% longer', () => {
    // Prior 3 days: feeds every 3h (4 feeds/day at 0, 3, 6, 9h)
    // Recent 3 days: feeds every 4h (3 feeds/day at 0, 4, 8h) — 33% longer
    const events: TrackerEvent[] = [];
    // Prior window: days 4–6 ago
    for (let d = 4; d <= 6; d++) {
      for (const h of [8, 11, 14, 17]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5 }));
      }
    }
    // Recent window: days 1–3 ago
    for (let d = 1; d <= 3; d++) {
      for (const h of [8, 12, 16]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5 }));
      }
    }
    const signals = detectTransitionSignals(events, NOW);
    expect(signals.some(s => s.kind === 'feed_interval_lengthening')).toBe(true);
    expect(signals.find(s => s.kind === 'feed_interval_lengthening')?.direction).toBe('positive');
  });

  test('does not flag feed_interval_lengthening when change is below threshold', () => {
    // Both windows: feeds every 3h — no meaningful change
    const events: TrackerEvent[] = [];
    for (let d = 1; d <= 6; d++) {
      for (const h of [8, 11, 14, 17]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5 }));
      }
    }
    const signals = detectTransitionSignals(events, NOW);
    expect(signals.some(s => s.kind === 'feed_interval_lengthening')).toBe(false);
  });

  test('detects nap_consolidating when nap count drops by >= 0.5/day', () => {
    // Prior: 3 naps/day for 3 days
    // Recent: 2 naps/day for 3 days
    const events: TrackerEvent[] = [];
    for (let d = 4; d <= 6; d++) {
      for (const start of [9, 13, 16]) {
        const s = new Date(NOW);
        s.setUTCDate(s.getUTCDate() - d);
        s.setUTCHours(start, 0, 0, 0);
        const e = new Date(s.getTime() + 60 * 60_000);
        events.push(makeEvent('b1', 'nap', s.toISOString(), { endedAt: e.toISOString() }));
      }
    }
    for (let d = 1; d <= 3; d++) {
      for (const start of [9, 13]) {
        const s = new Date(NOW);
        s.setUTCDate(s.getUTCDate() - d);
        s.setUTCHours(start, 0, 0, 0);
        const e = new Date(s.getTime() + 60 * 60_000);
        events.push(makeEvent('b1', 'nap', s.toISOString(), { endedAt: e.toISOString() }));
      }
    }
    const signals = detectTransitionSignals(events, NOW);
    expect(signals.some(s => s.kind === 'nap_consolidating')).toBe(true);
    expect(signals.find(s => s.kind === 'nap_consolidating')?.direction).toBe('positive');
  });

  test('detects sleep_stretch_milestone when all-time longest is recent and >= 5h', () => {
    // All-time longest: 6h stretch yesterday
    const sixHStart = new Date(NOW);
    sixHStart.setUTCDate(sixHStart.getUTCDate() - 1);
    sixHStart.setUTCHours(21, 0, 0, 0);
    const sixHEnd = new Date(sixHStart.getTime() + 6 * 60 * 60_000);
    const longSleep = makeEvent('b1', 'sleep', sixHStart.toISOString(), {
      endedAt: sixHEnd.toISOString(),
    });
    const signals = detectTransitionSignals([longSleep], NOW);
    expect(signals.some(s => s.kind === 'sleep_stretch_milestone')).toBe(true);
    expect(signals.find(s => s.kind === 'sleep_stretch_milestone')?.valueMs).toBeGreaterThanOrEqual(
      6 * 60 * 60_000,
    );
  });

  test('does not flag sleep_stretch_milestone when record is older than 7 days', () => {
    const oldStart = new Date(NOW);
    oldStart.setUTCDate(oldStart.getUTCDate() - 10);
    const oldEnd = new Date(oldStart.getTime() + 7 * 60 * 60_000);
    const oldSleep = makeEvent('b1', 'sleep', oldStart.toISOString(), {
      endedAt: oldEnd.toISOString(),
    });
    const signals = detectTransitionSignals([oldSleep], NOW);
    expect(signals.some(s => s.kind === 'sleep_stretch_milestone')).toBe(false);
  });

  test('detects oz_intake_dropping for Stage 2+ babies when oz falls >15%', () => {
    // Baby ~5 months old (Stage 2)
    const birthMs = Date.now() - 22 * 7 * 24 * 60 * 60_000;
    const birthDate = new Date(birthMs).toISOString().slice(0, 10);

    const events: TrackerEvent[] = [];
    // Prior 3 days: 32 oz/day
    for (let d = 4; d <= 6; d++) {
      for (const h of [8, 11, 14, 17, 20, 23]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5.5 }));
      }
    }
    // Recent 3 days: 20 oz/day — >15% drop
    for (let d = 1; d <= 3; d++) {
      for (const h of [8, 12, 16, 20]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5 }));
      }
    }
    const signals = detectTransitionSignals(events, NOW, birthDate);
    expect(signals.some(s => s.kind === 'oz_intake_dropping')).toBe(true);
    expect(signals.find(s => s.kind === 'oz_intake_dropping')?.direction).toBe('watch');
  });

  test('does not flag oz_intake_dropping for newborns (Stage 1)', () => {
    // Baby 8 weeks old — Stage 1
    const birthMs = Date.now() - 8 * 7 * 24 * 60 * 60_000;
    const birthDate = new Date(birthMs).toISOString().slice(0, 10);

    const events: TrackerEvent[] = [];
    for (let d = 4; d <= 6; d++) {
      for (const h of [8, 11, 14, 17]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 5 }));
      }
    }
    for (let d = 1; d <= 3; d++) {
      for (const h of [8, 12]) {
        const dt = new Date(NOW);
        dt.setUTCDate(dt.getUTCDate() - d);
        dt.setUTCHours(h, 0, 0, 0);
        events.push(makeEvent('b1', 'bottle', dt.toISOString(), { value: 3 }));
      }
    }
    const signals = detectTransitionSignals(events, NOW, birthDate);
    expect(signals.some(s => s.kind === 'oz_intake_dropping')).toBe(false);
  });
});
