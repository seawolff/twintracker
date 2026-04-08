/** Derive rolling 14-day medians (feed interval, oz, nap duration, awake window) to personalise schedules. */
import type { TrackerEvent } from '../types/index';
import { median } from './mathUtils';

export interface LearnedStats {
  /** Median ms between consecutive feed events (bottle or nursing). Null if < 3 intervals. */
  avgFeedIntervalMs: number | null;
  /** Median oz per bottle event. Null if < 3 bottle events. */
  avgBottleOz: number | null;
  /** Median duration of completed naps (endedAt − startedAt). Null if < 3 completed naps. */
  avgNapDurationMs: number | null;
  /** Median awake window: time from nap.endedAt to next nap.startedAt. Null if < 3 pairs. */
  avgAwakeWindowMs: number | null;
}

import { MAX_BOTTLE_OZ } from '../config';

/** Rolling window for computing learned schedule stats. */
const LEARNED_STATS_WINDOW_DAYS = 14;
const WINDOW_MS = LEARNED_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** Feed gaps longer than this are overnight pauses, not normal feed intervals. */
const MAX_FEED_GAP_MS = 8 * 60 * 60 * 1000;
/** Sanity bounds for completed nap durations. */
const MIN_NAP_DURATION_MS = 5 * 60_000;
const MAX_NAP_DURATION_MS = 4 * 60 * 60_000;
/** Sanity bounds for awake windows between consecutive naps. */
const MIN_AWAKE_WINDOW_MS = 10 * 60_000;
const MAX_AWAKE_WINDOW_MS = 8 * 60 * 60_000;

export function computeLearnedStats(events: TrackerEvent[], now: Date): LearnedStats {
  const cutoff = now.getTime() - WINDOW_MS;

  // Pre-parse timestamps once — ISO string → ms — so each event pays the Date parse cost once.
  const recent = events
    .map(e => ({
      ...e,
      startedAtMs: new Date(e.startedAt).getTime(),
      endedAtMs: e.endedAt ? new Date(e.endedAt).getTime() : null,
    }))
    .filter(e => e.startedAtMs >= cutoff);

  // ── Feed interval ────────────────────────────────────────────────────────────
  const feedTimes = recent
    .filter(e => e.type === 'bottle' || e.type === 'nursing')
    .map(e => e.startedAtMs)
    .sort((a, b) => a - b);

  const feedIntervals: number[] = [];
  for (let i = 1; i < feedTimes.length; i++) {
    const gap = feedTimes[i] - feedTimes[i - 1];
    // Skip zero-gaps (duplicate timestamps) and overnight gaps > 8h
    if (gap > 0 && gap < MAX_FEED_GAP_MS) {
      feedIntervals.push(gap);
    }
  }

  // ── Bottle oz ────────────────────────────────────────────────────────────────
  // Coerce to Number — pg returns NUMERIC columns as strings at runtime despite the TS type.
  const bottleOzValues = recent
    .filter(e => e.type === 'bottle' && e.value != null)
    .map(e => Number(e.value))
    .filter(v => v > 0 && v <= MAX_BOTTLE_OZ);

  // ── Nap duration (completed naps only) ───────────────────────────────────────
  const napDurations = recent
    .filter(e => e.type === 'nap' && e.endedAtMs != null)
    .map(e => e.endedAtMs! - e.startedAtMs)
    .filter(d => d > MIN_NAP_DURATION_MS && d < MAX_NAP_DURATION_MS);

  // ── Awake window (nap.endedAt → next nap.startedAt) ─────────────────────────
  const completedNaps = recent
    .filter(e => e.type === 'nap' && e.endedAtMs != null)
    .sort((a, b) => a.startedAtMs - b.startedAtMs);

  const awakeWindows: number[] = [];
  for (let i = 0; i < completedNaps.length - 1; i++) {
    const gap = completedNaps[i + 1].startedAtMs - completedNaps[i].endedAtMs!;
    if (gap >= MIN_AWAKE_WINDOW_MS && gap <= MAX_AWAKE_WINDOW_MS) {
      awakeWindows.push(gap);
    }
  }

  return {
    avgFeedIntervalMs: median(feedIntervals, 3),
    avgBottleOz: median(bottleOzValues, 3),
    avgNapDurationMs: median(napDurations, 3),
    avgAwakeWindowMs: median(awakeWindows, 3),
  };
}
