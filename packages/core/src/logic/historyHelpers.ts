/** Display helpers: formatTime, formatDuration, formatTimeAgo, eventLabel. */
import type { TrackerEvent } from '../types';

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
      return event.endedAt ? `Nap ${formatDuration(event.startedAt, event.endedAt)}` : 'Nap';
    case 'sleep':
      return event.endedAt ? `Sleep ${formatDuration(event.startedAt, event.endedAt)}` : 'Sleep';
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
