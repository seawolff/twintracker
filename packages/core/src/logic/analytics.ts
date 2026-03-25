/** Aggregate weekly stats (oz, sleep, diapers, milestones) from raw tracker events. */
import type { TrackerEvent } from '../types/index';
import { median } from './mathUtils';
import {
  getAgeWeeks,
  getScheduleForAge,
  getDefaultOzForAge,
  getTargetDailySleepMs,
  getSelfSoothingMinutes,
} from './schedule';

export interface BabyAnalytics {
  totalOzThisWeek: number;
  avgOzPerFeed: number | null;
  avgFeedIntervalMs: number | null;
  /** Daytime naps */
  napCountThisWeek: number;
  totalNapMsThisWeek: number;
  avgNapDurationMs: number | null;
  longestNapMs: number | null;
  /** Nighttime sleep events */
  nightSleepCountThisWeek: number;
  totalNightSleepMsThisWeek: number;
  avgNightSleepDurationMs: number | null;
  /** Combined nap + night sleep */
  totalSleepMsThisWeek: number;
  /** ms delta vs prior week (nap + night) — positive = more sleep this week */
  sleepDeltaVsLastWeek: number | null;
  diaperCountThisWeek: number;
  avgDiapersPerDay: number;
  foodCountThisWeek: number;
  milestones: TrackerEvent[];
  /** Which time window this covers */
  period: 'day' | 'week' | 'month';
  /** Actual days elapsed in the window (for per-day averages) */
  daysInPeriod: number;
  /** Total bottle + nursing feeds */
  totalFeeds: number;
  /** Total oz divided by daysInPeriod */
  avgOzPerDay: number;
  /** Age-appropriate target oz per bottle feed */
  targetOzPerFeed: number;
  /** Age-appropriate target feed interval */
  targetFeedIntervalMs: number;
  /** Age-appropriate target nap duration */
  targetNapDurationMs: number;
  /** AAP max recommended daily oz (~32 oz) */
  targetDailyOzMax: number;
  /** Average feeds (bottle + nursing) per day */
  avgFeedsPerDay: number;
  /** Average combined daily sleep (naps + night) in ms */
  avgDailySleepMs: number;
  /** Age-appropriate total daily sleep target range */
  targetDailySleepMs: { minMs: number; maxMs: number };
  /** ms elapsed since the most recent dirty or both diaper — null if none logged */
  msSinceLastDirty: number | null;
  /** Minimum recommended wet diapers per day (age-gated; null when no longer clinically relevant) */
  targetMinWetDiapersPerDay: number | null;
  /** Age-appropriate self-soothing wait in ms (from getSelfSoothingMinutes) */
  selfSoothingWaitMs: number;
  /** Days of actual event data available within the selected period (may be < periodDays) */
  dataSpanDays: number;
}

export function computeAnalytics(
  events: TrackerEvent[],
  now: Date,
  resetHour: number,
  period: 'day' | 'week' | 'month' = 'week',
  birthDate?: string,
): BabyAnalytics {
  const nowMs = now.getTime();

  function periodBoundaryMs(daysAgo: number): number {
    const d = new Date(now);
    d.setHours(resetHour, 0, 0, 0);
    if (d.getTime() > nowMs) {
      d.setDate(d.getDate() - 1);
    }
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  }
  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;
  const thisWeekStart = periodBoundaryMs(periodDays);
  const lastWeekStart = periodBoundaryMs(periodDays * 2);

  const thisWeek = events.filter(e => {
    // Sleep/nap events count in the period they END — a sleep started before the
    // window that ends inside it is still counted; one that starts inside but hasn't
    // ended is excluded until it closes.
    const isSleepLike = (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null;
    const t = new Date(isSleepLike ? e.endedAt! : e.startedAt).getTime();
    return t >= thisWeekStart && t <= nowMs;
  });
  const lastWeek = events.filter(e => {
    const isSleepLike = (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null;
    const t = new Date(isSleepLike ? e.endedAt! : e.startedAt).getTime();
    return t >= lastWeekStart && t < thisWeekStart;
  });

  // Single pass over thisWeek — collect per-type buckets without re-scanning
  let totalOzThisWeek = 0;
  let totalFeeds = 0;
  let diaperCountThisWeek = 0;
  let foodCountThisWeek = 0;
  const ozValues: number[] = [];
  const feedTimes: number[] = [];
  const napDurationsThisWeek: number[] = [];
  const nightSleepDurationsThisWeek: number[] = [];

  for (const e of thisWeek) {
    const t = new Date(e.startedAt).getTime();
    if (e.type === 'bottle') {
      const oz = Number(e.value ?? 0);
      totalOzThisWeek += oz;
      if (oz > 0) {
        ozValues.push(oz);
      }
      feedTimes.push(t);
      totalFeeds++;
    } else if (e.type === 'nursing') {
      feedTimes.push(t);
      totalFeeds++;
    } else if (e.type === 'nap' && e.endedAt != null) {
      const dur = new Date(e.endedAt).getTime() - t;
      if (dur > 5 * 60_000) {
        napDurationsThisWeek.push(dur);
      }
    } else if (e.type === 'sleep' && e.endedAt != null) {
      const dur = new Date(e.endedAt).getTime() - t;
      if (dur > 5 * 60_000) {
        nightSleepDurationsThisWeek.push(dur);
      }
    } else if (e.type === 'diaper') {
      diaperCountThisWeek++;
    } else if (e.type === 'food') {
      foodCountThisWeek++;
    }
  }

  // ── Feeding ──────────────────────────────────────────────────────────────────
  const avgOzPerFeed = median(ozValues);

  feedTimes.sort((a, b) => a - b);
  const feedIntervals: number[] = [];
  for (let i = 1; i < feedTimes.length; i++) {
    const gap = feedTimes[i] - feedTimes[i - 1];
    if (gap < 8 * 60 * 60_000) {
      feedIntervals.push(gap);
    }
  }
  const avgFeedIntervalMs = median(feedIntervals);

  // ── Naps (daytime) ────────────────────────────────────────────────────────────
  const napCountThisWeek = napDurationsThisWeek.length;
  const totalNapMsThisWeek = napDurationsThisWeek.reduce((s, d) => s + d, 0);
  const avgNapDurationMs = median(napDurationsThisWeek);
  const longestNapMs = napCountThisWeek > 0 ? Math.max(...napDurationsThisWeek) : null;

  // ── Night sleep ───────────────────────────────────────────────────────────────
  const nightSleepCountThisWeek = nightSleepDurationsThisWeek.length;
  const totalNightSleepMsThisWeek = nightSleepDurationsThisWeek.reduce((s, d) => s + d, 0);
  const avgNightSleepDurationMs = median(nightSleepDurationsThisWeek);

  // ── Combined sleep delta vs last week ─────────────────────────────────────────
  const totalSleepMsThisWeek = totalNapMsThisWeek + totalNightSleepMsThisWeek;

  const lastWeekSleepMs = lastWeek
    .filter(e => (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null)
    .map(e => new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime())
    .filter(d => d > 5 * 60_000)
    .reduce((s, d) => s + d, 0);
  const lastWeekHasSleep = lastWeek.some(
    e => (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null,
  );
  const sleepDeltaVsLastWeek = lastWeekHasSleep ? totalSleepMsThisWeek - lastWeekSleepMs : null;

  // ── Diapers ──────────────────────────────────────────────────────────────────
  const daysInPeriod = Math.max(1, (nowMs - thisWeekStart) / (24 * 60 * 60_000));
  const avgDiapersPerDay = diaperCountThisWeek / daysInPeriod;

  // ── Food & milestones ────────────────────────────────────────────────────────
  const milestones = events
    .filter(e => e.type === 'milestone')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // ── Research benchmarks ───────────────────────────────────────────────────────
  const ageWeeks = getAgeWeeks(birthDate);
  const ageSchedule = getScheduleForAge(ageWeeks);
  const targetOzPerFeed = getDefaultOzForAge(ageWeeks);
  const targetFeedIntervalMs = ageSchedule.feedMs;
  const targetNapDurationMs = ageSchedule.napMs;
  const targetDailyOzMax = 32;
  const avgOzPerDay = daysInPeriod > 0 ? totalOzThisWeek / daysInPeriod : 0;
  const avgFeedsPerDay = daysInPeriod > 0 ? totalFeeds / daysInPeriod : 0;
  const avgDailySleepMs = daysInPeriod > 0 ? totalSleepMsThisWeek / daysInPeriod : 0;
  const targetDailySleepMs = getTargetDailySleepMs(ageWeeks);

  // ── Diaper clinical context ───────────────────────────────────────────────────
  // Time since last dirty/both diaper — scans all events, not just this period,
  // so it's useful even when no diapers were logged in the current window.
  const lastDirty = events
    .filter(e => e.type === 'diaper' && (e.notes === 'dirty' || e.notes === 'both'))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  const msSinceLastDirty = lastDirty ? nowMs - new Date(lastDirty.startedAt).getTime() : null;
  // Clinical threshold: 6+ wet diapers/day is the newborn adequacy marker.
  // After ~3 months (13 weeks) it's no longer a standard monitoring metric.
  const targetMinWetDiapersPerDay = ageWeeks < 13 ? 6 : null;

  const selfSoothingWaitMs = getSelfSoothingMinutes(ageWeeks) * 60_000;

  // Days of actual data in the period — used by UI to detect insufficient data.
  const earliestInPeriod =
    thisWeek.length > 0 ? Math.min(...thisWeek.map(e => new Date(e.startedAt).getTime())) : nowMs;
  const dataSpanDays = Math.min(periodDays, (nowMs - earliestInPeriod) / (24 * 60 * 60_000));

  return {
    totalOzThisWeek,
    avgOzPerFeed,
    avgFeedIntervalMs,
    napCountThisWeek,
    totalNapMsThisWeek,
    avgNapDurationMs,
    longestNapMs,
    nightSleepCountThisWeek,
    totalNightSleepMsThisWeek,
    avgNightSleepDurationMs,
    totalSleepMsThisWeek,
    sleepDeltaVsLastWeek,
    diaperCountThisWeek,
    avgDiapersPerDay,
    foodCountThisWeek,
    milestones,
    period,
    daysInPeriod,
    totalFeeds,
    avgOzPerDay,
    targetOzPerFeed,
    targetFeedIntervalMs,
    targetNapDurationMs,
    targetDailyOzMax,
    avgFeedsPerDay,
    avgDailySleepMs,
    targetDailySleepMs,
    msSinceLastDirty,
    targetMinWetDiapersPerDay,
    selfSoothingWaitMs,
    dataSpanDays,
  };
}
