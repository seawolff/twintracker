import type { TrackerEvent } from '../types';

export interface DayGroup {
  /** The reset boundary that opens this period (e.g. 6:00 AM on March 14th) */
  date: Date;
  /** Human-readable label: "Today", "Yesterday", or "March 12th 2026" */
  label: string;
  /** Events in this period, descending by startedAt */
  events: TrackerEvent[];
}

/** Ordinal suffix for a day number (1st, 2nd, 3rd, 4th…) */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function dateLabel(periodStart: Date, todayStart: Date, yesterdayStart: Date): string {
  if (periodStart.getTime() === todayStart.getTime()) {
    return 'Today';
  }
  if (periodStart.getTime() === yesterdayStart.getTime()) {
    return 'Yesterday';
  }
  const month = periodStart.toLocaleString('en-US', { month: 'long' });
  return `${month} ${ordinal(periodStart.getDate())} ${periodStart.getFullYear()}`;
}

/**
 * Returns the reset-period boundary that `now` belongs to.
 *
 * If `now` is at or after today's resetHour → boundary is today at resetHour.
 * If `now` is before today's resetHour → boundary is yesterday at resetHour.
 */
export function currentPeriodStart(now: Date, resetHour: number): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour, 0, 0, 0);
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

/**
 * Groups a list of events into day buckets based on a configurable daily reset hour.
 * Returns groups in descending order (most recent first).
 */
export function groupEventsByDay(events: TrackerEvent[], now: Date, resetHour = 0): DayGroup[] {
  if (events.length === 0) {
    return [];
  }

  const todayStart = currentPeriodStart(now, resetHour);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  // Map from period-start timestamp → events
  const buckets = new Map<number, TrackerEvent[]>();

  for (const event of events) {
    // Sleep/nap events belong to the day they END in — a sleep started at 9pm
    // that ends at 6am is attributed to the morning it woke up, not the night it began.
    const isSleepLike = (event.type === 'nap' || event.type === 'sleep') && event.endedAt != null;
    const attributionMs = isSleepLike
      ? new Date(event.endedAt!).getTime()
      : new Date(event.startedAt).getTime();

    // Walk back from todayStart to find which period this event belongs to
    const periodMs = todayStart.getTime();
    let bucketStart: Date;

    if (attributionMs >= periodMs) {
      bucketStart = todayStart;
    } else {
      // Find the correct past period
      const diffMs = periodMs - attributionMs;
      const daysDiff = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
      bucketStart = new Date(todayStart);
      bucketStart.setDate(bucketStart.getDate() - daysDiff);
    }

    const key = bucketStart.getTime();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      buckets.set(key, [event]);
    }
  }

  // Sort buckets descending, sort events within each bucket descending
  return Array.from(buckets.entries())
    .sort(([a], [b]) => b - a)
    .map(([key, evts]) => {
      const periodStart = new Date(key);
      return {
        date: periodStart,
        label: dateLabel(periodStart, todayStart, yesterdayStart),
        events: evts.sort((a, b) => {
          const tA =
            (a.type === 'nap' || a.type === 'sleep') && a.endedAt != null ? a.endedAt : a.startedAt;
          const tB =
            (b.type === 'nap' || b.type === 'sleep') && b.endedAt != null ? b.endedAt : b.startedAt;
          return tB.localeCompare(tA);
        }),
      };
    });
}
