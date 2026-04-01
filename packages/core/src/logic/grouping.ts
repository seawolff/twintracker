/** Groups events into day buckets based on a configurable reset hour; sleep attributed by wake-up day. */
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
    // Determine the timestamp used to assign this event to a day bucket.
    //
    // • sleep (with endedAt): attributed to the calendar day of wake-up, keyed at
    //   that day's reset-hour boundary + 1 ms. This ensures a sleep ending at 6:39 AM
    //   with a 7 AM reset still lands in "today" rather than "yesterday", because the
    //   user mentally associates the sleep with the morning they woke up, not the
    //   reset-hour period it technically falls inside.
    //
    // • nap (with endedAt): attributed by endedAt directly (naps are short and rarely
    //   cross the reset boundary, so the simpler approach is fine).
    //
    // • everything else: attributed by startedAt.
    let attributionMs: number;
    if (event.type === 'sleep' && event.endedAt != null) {
      const endDate = new Date(event.endedAt);
      // Pin to the reset-hour moment of the calendar day the sleep ended on.
      // +1 ms avoids the exact-boundary edge case in the floor-based daysDiff formula.
      attributionMs = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        resetHour,
        0,
        0,
        1,
      ).getTime();
    } else if (event.type === 'nap' && event.endedAt != null) {
      attributionMs = new Date(event.endedAt).getTime();
    } else {
      attributionMs = new Date(event.startedAt).getTime();
    }

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
