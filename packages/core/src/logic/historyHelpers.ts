/** Display helpers: formatTime, formatDuration, formatTimeAgo, eventLabel, eventLabelShort, formatEventTime. */
import type { TrackerEvent } from '../types';
import { formatClockTime, type TimeFormat } from '../config';
import {
  formatBottleSource,
  formatPumpStash,
  parseBottleNotes,
  parsePumpNotes,
} from './pumpHelpers';
import { formatMilestoneText } from './milestones';

/** Show relative time (timeAgo) when event is within this window; otherwise show absolute time. */
const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;

export function formatTime(iso: string, timeFormat: TimeFormat = '12h'): string {
  return formatClockTime(new Date(iso), timeFormat);
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
      return event.notes === 'left' || event.notes === 'right'
        ? `Nursing · ${event.notes}`
        : 'Nursing';
    case 'pump':
      return event.endedAt ? `Pump (${formatDuration(event.startedAt, event.endedAt)})` : 'Pump';
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
export function formatEventTime(iso: string, now: Date, timeFormat: TimeFormat = '12h'): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < TWO_HOURS_MS) {
    return formatTimeAgo(iso, now);
  }
  return formatTime(iso, timeFormat);
}

export function eventLabel(event: TrackerEvent): string {
  switch (event.type) {
    case 'bottle': {
      const bottle = parseBottleNotes(event.notes);
      const parts: string[] = [];
      if (event.value != null) {
        parts.push(`${event.value}${event.unit ?? 'oz'}`);
      }
      const source = formatBottleSource(bottle);
      if (source) {
        parts.push(source);
      }
      return parts.length > 0 ? `Bottle ${parts.join(' · ')}` : 'Bottle';
    }
    case 'nursing': {
      const parts: string[] = [];
      if (event.value != null) {
        parts.push(`${event.value}m`);
      }
      if (event.notes === 'left' || event.notes === 'right') {
        parts.push(event.notes);
      }
      return parts.length > 0 ? `Nursing ${parts.join(' · ')}` : 'Nursing';
    }
    case 'pump': {
      const pump = parsePumpNotes(event.notes);
      const parts: string[] = [];
      if (event.value != null) {
        parts.push(`${event.value}${event.unit ?? 'oz'}`);
      }
      if (event.notes) {
        parts.push(pump.side);
      }
      const stash = formatPumpStash(pump);
      if (stash) {
        parts.push(stash);
      }
      if (event.endedAt) {
        parts.push(formatDuration(event.startedAt, event.endedAt));
      }
      return parts.length > 0 ? `Pump ${parts.join(' · ')}` : 'Pump';
    }
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
      const desc = formatMilestoneText(event.notes);
      return desc ? `★ ${desc}` : '★ Milestone';
    }
    default:
      return event.type;
  }
}
