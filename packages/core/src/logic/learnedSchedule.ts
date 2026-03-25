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

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function computeLearnedStats(events: TrackerEvent[], now: Date): LearnedStats {
  const cutoff = now.getTime() - WINDOW_MS;

  const recent = events.filter(e => new Date(e.startedAt).getTime() >= cutoff);

  // ── Feed interval ────────────────────────────────────────────────────────────
  const feeds = recent
    .filter(e => e.type === 'bottle' || e.type === 'nursing')
    .map(e => new Date(e.startedAt).getTime())
    .sort((a, b) => a - b);

  const feedIntervals: number[] = [];
  for (let i = 1; i < feeds.length; i++) {
    const gap = feeds[i] - feeds[i - 1];
    // Skip overnight gaps > 8h — not a normal feed interval
    if (gap < 8 * 60 * 60 * 1000) {
      feedIntervals.push(gap);
    }
  }

  // ── Bottle oz ────────────────────────────────────────────────────────────────
  const bottleOzValues = recent
    .filter(e => e.type === 'bottle' && e.value != null && e.value > 0 && e.value <= 16)
    .map(e => e.value as number);

  // ── Nap duration (completed naps only) ───────────────────────────────────────
  const napDurations = recent
    .filter(e => e.type === 'nap' && e.endedAt != null)
    .map(e => new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime())
    .filter(d => d > 5 * 60_000 && d < 4 * 60 * 60_000); // 5m–4h sanity bounds

  // ── Awake window (nap.endedAt → next nap.startedAt) ─────────────────────────
  const completedNaps = recent
    .filter(e => e.type === 'nap' && e.endedAt != null)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const awakeWindows: number[] = [];
  for (let i = 0; i < completedNaps.length - 1; i++) {
    const gap =
      new Date(completedNaps[i + 1].startedAt).getTime() -
      new Date(completedNaps[i].endedAt!).getTime();
    // Sanity: awake window 10m–8h
    if (gap >= 10 * 60_000 && gap <= 8 * 60 * 60_000) {
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
