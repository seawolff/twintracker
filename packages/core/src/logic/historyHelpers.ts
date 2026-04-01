/** Display helpers: formatTime, formatDuration, formatTimeAgo, eventLabel, eventLabelShort, formatEventTime. */
import type { TrackerEvent } from '../types';

/** Show relative time (timeAgo) when event is within this window; otherwise show absolute time. */
const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatTimeAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) {
    return 'just now';
  }
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ago`;
  }
  return `${minutes}m ago`;
}

/**
 * Short label — type name only, no user-input detail string.
 * Used on compact/phone widths to conserve horizontal space.
 */
export function eventLabelShort(event: TrackerEvent): string {
  switch (event.type) {
    case 'bottle':
      return 'Bottle';
    case 'nursing':
      return 'Nursing';
    case 'nap':
      if (event.notes === 'attempted') {
        return 'Nap (attempted)';
      }
      return event.endedAt ? `Nap (${formatDuration(event.startedAt, event.endedAt)})` : 'Nap';
    case 'sleep':
      return event.endedAt ? `Sleep (${formatDuration(event.startedAt, event.endedAt)})` : 'Sleep';
    case 'diaper':
      return 'Diaper';
    case 'medicine':
      return 'Medicine';
    case 'food':
      return 'Food';
    case 'milestone':
      return '★ Milestone';
    default:
      return event.type;
  }
}

/**
 * Combined time display:
 *   < 2 h ago → relative (e.g. "5m ago", "just now")
 *   ≥ 2 h ago → absolute time (e.g. "3:45 PM")
 */
export function formatEventTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < TWO_HOURS_MS) {
    return formatTimeAgo(iso, now);
  }
  return formatTime(iso);
}

export function eventLabel(event: TrackerEvent): string {
  switch (event.type) {
    case 'bottle':
      return event.value != null ? `Bottle ${event.value}${event.unit ?? 'oz'}` : 'Bottle';
    case 'nursing':
      return event.value != null ? `Nursing ${event.value}m` : 'Nursing';
    case 'nap':
      if (event.notes === 'attempted') {
        return 'Nap (attempted)';
      }
      return event.endedAt ? `Nap (${formatDuration(event.startedAt, event.endedAt)})` : 'Nap';
    case 'sleep':
      return event.endedAt ? `Sleep (${formatDuration(event.startedAt, event.endedAt)})` : 'Sleep';
    case 'diaper':
      return `Diaper · ${event.notes ?? 'wet'}`;
    case 'medicine':
      return 'Medicine';
    case 'food': {
      const desc = event.notes?.trim();
      return desc ? `Food — ${desc}` : 'Food';
    }
    case 'milestone': {
      const desc = event.notes?.trim();
      return desc ? `★ ${desc}` : '★ Milestone';
    }
    default:
      return event.type;
  }
}
