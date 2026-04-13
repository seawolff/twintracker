/** Aggregate weekly stats (oz, sleep, diapers, milestones) from raw tracker events. */
import type { TrackerEvent } from '../types/index';
import { median } from './mathUtils';
import {
  getAgeWeeks,
  getAgeDays,
  getScheduleForAge,
  getDefaultOzForAge,
  getTargetDailySleepMs,
  getSelfSoothingMinutes,
} from './schedule';
import { AAP_MAX_DAILY_OZ } from '../config';

const MS_PER_DAY = 24 * 60 * 60_000;
/** Naps/sleeps shorter than this are ignored (incomplete or accidental taps). */
const MIN_TRACKABLE_SLEEP_MS = 5 * 60_000;
/** Feed gaps longer than this are overnight pauses, not normal feed intervals. */
const MAX_FEED_GAP_MS = 8 * 60 * 60_000;
/** After this many weeks, wet diaper count is no longer a standard clinical monitoring metric. */
const NEWBORN_WET_DIAPER_TRACKING_WEEKS = 13;
/** Number of days of history returned by computeTrendData. */
export const TREND_DAYS = 14;
/**
 * Number of recent days compared against the prior equal window to detect transition signals.
 * e.g. last 3 days vs the 3 days before that.
 */
const SIGNAL_COMPARISON_DAYS = 3;
/** Feed interval must lengthen by this fraction to surface a lengthening signal. */
const SIGNAL_INTERVAL_LENGTHENING_PCT = 0.15;
/** Nap count must drop by at least this many naps/day to surface a consolidation signal. */
const SIGNAL_NAP_DROP_THRESHOLD = 0.5;
/** Daily oz intake must fall by this fraction to surface a dropping signal. */
const SIGNAL_OZ_DROP_PCT = 0.15;
/** Age in weeks at which Stage 2 begins — oz dropping signal only relevant from here on. */
const STAGE2_START_WEEKS = 16;
/** Night sleep milestone thresholds (ms). A new all-time record crossing one of these is flagged. */
const SLEEP_MILESTONE_THRESHOLDS_MS = [5, 6, 7, 8].map(h => h * 60 * 60_000);

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
  /** Nap count delta vs prior period — positive = more naps this period */
  napDeltaVsLastWeek: number | null;
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
  period: 'day' | 'week' | 'month' = 'week',
  birthDate?: string,
): BabyAnalytics {
  const nowMs = now.getTime();

  // Analytics always uses calendar-day midnight boundaries, never the user's
  // wake time. Wake time only affects the day/night colour theme.
  function periodBoundaryMs(daysAgo: number): number {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  }
  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;
  // For 'day': since the most recent midnight. For week/month: last N calendar days.
  const thisWeekStart = period === 'day' ? periodBoundaryMs(0) : periodBoundaryMs(periodDays);
  const lastWeekStart = period === 'day' ? periodBoundaryMs(1) : periodBoundaryMs(periodDays * 2);

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
  // Running clamped totals — we clamp startedAt to thisWeekStart so that a sleep
  // event that started before the window but ended inside it only contributes the
  // portion that actually fell within the period to the total.
  let totalNapMsThisWeek = 0;
  let totalNightSleepMsThisWeek = 0;
  const ozValues: number[] = [];
  const feedTimes: number[] = [];
  // Full (unclamped) individual durations — used for avg / longest metrics where
  // the quality of a single sleep event is what matters, not its period overlap.
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
      const endMs = new Date(e.endedAt).getTime();
      const dur = endMs - t; // full duration for avg/longest
      if (dur > MIN_TRACKABLE_SLEEP_MS) {
        napDurationsThisWeek.push(dur);
        // Clamp start to window boundary for the running total.
        totalNapMsThisWeek += endMs - Math.max(t, thisWeekStart);
      }
    } else if (e.type === 'sleep' && e.endedAt != null) {
      const endMs = new Date(e.endedAt).getTime();
      const dur = endMs - t; // full duration for avg/longest
      if (dur > MIN_TRACKABLE_SLEEP_MS) {
        nightSleepDurationsThisWeek.push(dur);
        // Clamp start to window boundary for the running total.
        totalNightSleepMsThisWeek += endMs - Math.max(t, thisWeekStart);
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
    if (gap < MAX_FEED_GAP_MS) {
      feedIntervals.push(gap);
    }
  }
  const avgFeedIntervalMs = median(feedIntervals);

  // ── Naps (daytime) ────────────────────────────────────────────────────────────
  const napCountThisWeek = napDurationsThisWeek.length;
  // totalNapMsThisWeek accumulated above with clamped start times.
  const avgNapDurationMs = median(napDurationsThisWeek);
  const longestNapMs = napCountThisWeek > 0 ? Math.max(...napDurationsThisWeek) : null;

  // ── Night sleep ───────────────────────────────────────────────────────────────
  const nightSleepCountThisWeek = nightSleepDurationsThisWeek.length;
  // totalNightSleepMsThisWeek accumulated above with clamped start times.
  const avgNightSleepDurationMs = median(nightSleepDurationsThisWeek);

  // ── Combined sleep delta vs last week ─────────────────────────────────────────
  const totalSleepMsThisWeek = totalNapMsThisWeek + totalNightSleepMsThisWeek;

  const lastWeekSleepMs = lastWeek
    .filter(e => (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null)
    .map(e => {
      // Clamp startedAt to lastWeekStart to exclude pre-window hours.
      const clampedStart = Math.max(new Date(e.startedAt).getTime(), lastWeekStart);
      return new Date(e.endedAt!).getTime() - clampedStart;
    })
    .filter(d => d > MIN_TRACKABLE_SLEEP_MS)
    .reduce((s, d) => s + d, 0);
  const lastWeekHasSleep = lastWeek.some(
    e => (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null,
  );
  const sleepDeltaVsLastWeek = lastWeekHasSleep ? totalSleepMsThisWeek - lastWeekSleepMs : null;

  // ── Nap avg-duration delta vs last period ────────────────────────────────────
  const lastWeekNapDurations = lastWeek
    .filter(e => e.type === 'nap' && e.endedAt != null)
    .map(e => new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime())
    .filter(d => d > MIN_TRACKABLE_SLEEP_MS);
  const lastWeekAvgNapMs = median(lastWeekNapDurations);
  const napDeltaVsLastWeek =
    avgNapDurationMs != null && lastWeekAvgNapMs != null
      ? avgNapDurationMs - lastWeekAvgNapMs
      : null;

  // ── Diapers ──────────────────────────────────────────────────────────────────
  const daysInPeriod = Math.max(1, (nowMs - thisWeekStart) / MS_PER_DAY);
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
  const targetDailyOzMax = AAP_MAX_DAILY_OZ;
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
  // AAP: applies from day 4 (colostrum phase before then means lower output is normal).
  // After ~3 months (13 weeks) it's no longer a standard monitoring metric.
  const ageDays = getAgeDays(birthDate);
  const targetMinWetDiapersPerDay =
    ageWeeks < NEWBORN_WET_DIAPER_TRACKING_WEEKS && (ageDays === null || ageDays >= 4) ? 6 : null;

  const selfSoothingWaitMs = getSelfSoothingMinutes(ageWeeks) * 60_000;

  // Days of actual data in the period — used by UI to detect insufficient data.
  const earliestInPeriod =
    thisWeek.length > 0 ? Math.min(...thisWeek.map(e => new Date(e.startedAt).getTime())) : nowMs;
  const dataSpanDays = Math.min(periodDays, (nowMs - earliestInPeriod) / MS_PER_DAY);

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
    napDeltaVsLastWeek,
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

// ── Trend data ────────────────────────────────────────────────────────────────

/** A single data point in a per-day trend series. */
export interface TrendPoint {
  /** Unix ms of the start of this day slot (at resetHour). */
  dayMs: number;
  /** Computed value for this day — null when no relevant events were logged. */
  value: number | null;
}

/**
 * Per-day time-series data for the last TREND_DAYS days.
 * All arrays are ordered oldest → newest (index 0 = TREND_DAYS−1 days ago).
 */
export interface TrendData {
  /** Average feed interval per day (ms). */
  feedIntervalByDay: TrendPoint[];
  /** Average oz per bottle feed per day. */
  ozPerFeedByDay: TrendPoint[];
  /** Total oz consumed per day. */
  ozPerDayByDay: TrendPoint[];
  /** Completed daytime nap count per day. */
  napCountByDay: TrendPoint[];
  /** Longest completed night-sleep duration per day (ms). */
  longestNightByDay: TrendPoint[];
  /** Age-appropriate target oz/day (constant — for benchmark line on oz chart). */
  targetOzPerDay: number;
  /** Age-appropriate target feed interval ms (constant — for benchmark line). */
  targetFeedIntervalMs: number;
  /** Age-appropriate target daily sleep ms range (constant — for benchmark band). */
  targetDailySleepMs: { minMs: number; maxMs: number };
  /** Age-appropriate target naps per day (constant — for benchmark line on nap count chart). */
  targetNapsPerDay: number;
}

/**
 * Computes per-day trend series for the last TREND_DAYS days.
 * Suitable for sparkline / bar chart rendering on the analytics page.
 */
export function computeTrendData(
  events: TrackerEvent[],
  now: Date,
  birthDate?: string,
  // Number of daily slots to compute. Defaults to TREND_DAYS (14).
  // Pass 30 for monthly view charts.
  days: number = TREND_DAYS,
): TrendData {
  const nowMs = now.getTime();

  // Anchor today's slot at midnight — analytics always uses calendar-day
  // boundaries, never the user's wake time setting.
  const todayBoundary = new Date(now);
  todayBoundary.setHours(0, 0, 0, 0);
  const todayBoundaryMs = todayBoundary.getTime();

  // Build `days` slots ordered oldest → newest.
  // Slot i: [ todayBoundary − (days−1−i)d,  same + 1d ) capped at nowMs for the last slot.
  const slots: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < days; i++) {
    const daysBack = days - 1 - i;
    const start = todayBoundaryMs - daysBack * MS_PER_DAY;
    const end = daysBack === 0 ? nowMs : start + MS_PER_DAY;
    slots.push({ start, end });
  }

  // Pre-filter events to the trend window (plus one feed-gap buffer for interval calc).
  const windowStart = slots[0].start - MAX_FEED_GAP_MS;
  const windowEvents = events.filter(e => new Date(e.startedAt).getTime() >= windowStart);

  const feedIntervalByDay: TrendPoint[] = [];
  const ozPerFeedByDay: TrendPoint[] = [];
  const ozPerDayByDay: TrendPoint[] = [];
  const napCountByDay: TrendPoint[] = [];
  const longestNightByDay: TrendPoint[] = [];

  for (const slot of slots) {
    // Events counted in the slot they end (for sleep) or start (for feeds/diapers).
    const inSlot = windowEvents.filter(e => {
      const isSleepLike = (e.type === 'nap' || e.type === 'sleep') && e.endedAt != null;
      const t = new Date(isSleepLike ? e.endedAt! : e.startedAt).getTime();
      return t >= slot.start && t < slot.end;
    });

    // Feed interval — average gap between consecutive feeds within the slot.
    const feedTimes = inSlot
      .filter(e => e.type === 'bottle' || e.type === 'nursing')
      .map(e => new Date(e.startedAt).getTime())
      .sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < feedTimes.length; i++) {
      const gap = feedTimes[i] - feedTimes[i - 1];
      if (gap < MAX_FEED_GAP_MS) {
        intervals.push(gap);
      }
    }
    feedIntervalByDay.push({
      dayMs: slot.start,
      value: intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : null,
    });

    // Oz per feed and oz total.
    const bottleOzValues = inSlot
      .filter(e => e.type === 'bottle' && Number(e.value ?? 0) > 0)
      .map(e => Number(e.value));
    ozPerFeedByDay.push({
      dayMs: slot.start,
      value:
        bottleOzValues.length > 0
          ? bottleOzValues.reduce((s, v) => s + v, 0) / bottleOzValues.length
          : null,
    });
    ozPerDayByDay.push({
      dayMs: slot.start,
      value: bottleOzValues.length > 0 ? bottleOzValues.reduce((s, v) => s + v, 0) : null,
    });

    // Nap count — completed naps above the minimum trackable duration.
    const completedNaps = inSlot.filter(
      e =>
        e.type === 'nap' &&
        e.endedAt != null &&
        new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime() > MIN_TRACKABLE_SLEEP_MS,
    ).length;
    napCountByDay.push({
      dayMs: slot.start,
      value: completedNaps > 0 ? completedNaps : null,
    });

    // Longest night-sleep stretch.
    const nightDurations = inSlot
      .filter(e => e.type === 'sleep' && e.endedAt != null)
      .map(e => new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime())
      .filter(d => d > MIN_TRACKABLE_SLEEP_MS);
    longestNightByDay.push({
      dayMs: slot.start,
      value: nightDurations.length > 0 ? Math.max(...nightDurations) : null,
    });
  }

  const ageWeeks = getAgeWeeks(birthDate);
  const schedule = getScheduleForAge(ageWeeks);
  const targetOzPerFeed = getDefaultOzForAge(ageWeeks);
  const targetFeedsPerDay = Math.round(MS_PER_DAY / schedule.feedMs);
  const targetOzPerDay = Math.min(targetOzPerFeed * targetFeedsPerDay, AAP_MAX_DAILY_OZ);

  return {
    feedIntervalByDay,
    ozPerFeedByDay,
    ozPerDayByDay,
    napCountByDay,
    longestNightByDay,
    targetOzPerDay,
    targetFeedIntervalMs: schedule.feedMs,
    targetDailySleepMs: getTargetDailySleepMs(ageWeeks),
    // Stage 1 (<16w): 4–5 naps; Stage 2 (16w–18m): 2–3 naps; Stage 3 (18m+): 1 nap.
    // Use the midpoint of each range as the benchmark line.
    targetNapsPerDay: ageWeeks < 16 ? 4 : ageWeeks < 78 ? 2 : 1,
  };
}

// ── Transition signals ────────────────────────────────────────────────────────

export type TransitionSignalKind =
  | 'feed_interval_lengthening'
  | 'nap_consolidating'
  | 'sleep_stretch_milestone'
  | 'oz_intake_dropping';

export interface TransitionSignal {
  kind: TransitionSignalKind;
  /** positive = developmental progress, watch = may need attention */
  direction: 'positive' | 'watch';
  /** For sleep_stretch_milestone: the all-time longest stretch duration in ms. */
  valueMs?: number;
  /** For percentage-based signals: relative change as a fraction (e.g. 0.2 = +20%). */
  changePct?: number;
}

/** Average of non-null TrendPoint values within a half-open index range [from, to). */
function avgTrendSlice(points: TrendPoint[], from: number, to: number): number | null {
  const values = points
    .slice(from, to)
    .map(p => p.value)
    .filter((v): v is number => v !== null);
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * Detects developmental transition signals by comparing the most recent
 * SIGNAL_COMPARISON_DAYS days against the equal-length window before them.
 * Returns an empty array when there is insufficient data.
 */
export function detectTransitionSignals(
  events: TrackerEvent[],
  now: Date,
  birthDate?: string,
): TransitionSignal[] {
  const trend = computeTrendData(events, now, birthDate);
  const signals: TransitionSignal[] = [];

  // Index boundaries: [0 … priorStart … recentStart … TREND_DAYS]
  const recentStart = TREND_DAYS - SIGNAL_COMPARISON_DAYS;
  const priorStart = recentStart - SIGNAL_COMPARISON_DAYS;

  // 1. Feed interval lengthening — baby is stretching gaps between feeds.
  const recentInterval = avgTrendSlice(trend.feedIntervalByDay, recentStart, TREND_DAYS);
  const priorInterval = avgTrendSlice(trend.feedIntervalByDay, priorStart, recentStart);
  if (recentInterval !== null && priorInterval !== null && priorInterval > 0) {
    const changePct = (recentInterval - priorInterval) / priorInterval;
    if (changePct >= SIGNAL_INTERVAL_LENGTHENING_PCT) {
      signals.push({ kind: 'feed_interval_lengthening', direction: 'positive', changePct });
    }
  }

  // 2. Nap count consolidating — fewer naps per day signals a schedule stage transition.
  const recentNaps = avgTrendSlice(trend.napCountByDay, recentStart, TREND_DAYS);
  const priorNaps = avgTrendSlice(trend.napCountByDay, priorStart, recentStart);
  if (recentNaps !== null && priorNaps !== null && priorNaps > 0) {
    const drop = priorNaps - recentNaps; // positive = fewer naps recently
    if (drop >= SIGNAL_NAP_DROP_THRESHOLD) {
      signals.push({
        kind: 'nap_consolidating',
        direction: 'positive',
        changePct: drop / priorNaps,
      });
    }
  }

  // 3. Sleep stretch milestone — all-time longest night sleep occurred recently and
  //    crosses a meaningful threshold (5 h, 6 h, 7 h, or 8 h).
  const allSleep = events
    .filter(e => e.type === 'sleep' && e.endedAt != null)
    .map(e => ({
      duration: new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime(),
      endMs: new Date(e.endedAt!).getTime(),
    }))
    .filter(e => e.duration > MIN_TRACKABLE_SLEEP_MS);

  if (allSleep.length > 0) {
    const allTimeLongest = Math.max(...allSleep.map(e => e.duration));
    const sevenDaysAgo = now.getTime() - 7 * MS_PER_DAY;
    const recordIsRecent = allSleep.some(
      e => e.duration >= allTimeLongest - 5 * 60_000 && e.endMs >= sevenDaysAgo,
    );
    if (recordIsRecent) {
      // Find the highest threshold this record crosses.
      const milestone = [...SLEEP_MILESTONE_THRESHOLDS_MS].reverse().find(t => allTimeLongest >= t);
      if (milestone !== undefined) {
        signals.push({
          kind: 'sleep_stretch_milestone',
          direction: 'positive',
          valueMs: allTimeLongest,
        });
      }
    }
  }

  // 4. Oz intake dropping — only meaningful once solids are in play (Stage 2+).
  const ageWeeks = getAgeWeeks(birthDate);
  if (ageWeeks >= STAGE2_START_WEEKS) {
    const recentOz = avgTrendSlice(trend.ozPerDayByDay, recentStart, TREND_DAYS);
    const priorOz = avgTrendSlice(trend.ozPerDayByDay, priorStart, recentStart);
    if (recentOz !== null && priorOz !== null && priorOz > 0) {
      const changePct = (recentOz - priorOz) / priorOz; // negative = less recently
      if (changePct <= -SIGNAL_OZ_DROP_PCT) {
        signals.push({ kind: 'oz_intake_dropping', direction: 'watch', changePct });
      }
    }
  }

  return signals;
}
