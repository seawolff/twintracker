import type { BabyColor } from '../types';
import type { LiveActivityBabySnapshot, LiveActivitySnapshot } from './liveActivitySnapshot';

export const ANDROID_HOUSEHOLD_NOTIFICATION_GROUP_KEY = 'twintracker.household';
export const ANDROID_HOUSEHOLD_SUMMARY_TAG = 'twintracker.household.summary';
export const ANDROID_HOUSEHOLD_CHILD_NOTIFICATION_ID = 2001;
export const ANDROID_HOUSEHOLD_SUMMARY_NOTIFICATION_ID = 2000;

export interface AndroidLockScreenChildNotification {
  tag: string;
  babyId: string;
  title: string;
  body: string;
  expandedBody: string;
  summaryLine: string;
  sortKey: string;
  whenMs: number;
  accentColor: string;
}

export interface AndroidLockScreenNotificationPayload {
  groupKey: string;
  summaryTag: string;
  summaryTitle: string;
  summaryText: string;
  summaryLines: string[];
  children: AndroidLockScreenChildNotification[];
}

const MAX_SORT_MS = 9_999_999_999_999;

const BABY_ACCENT_HEX: Record<BabyColor, string> = {
  amber: '#f5c252',
  emerald: '#4fd19c',
  slate: '#9eb0ca',
  rose: '#f08494',
  sky: '#6cb8f2',
  violet: '#b08ff5',
};

function flattenSnapshots(snapshots: LiveActivitySnapshot[]): LiveActivityBabySnapshot[] {
  return snapshots.flatMap(snapshot => snapshot.babies);
}

function formatRemainingShort(targetAt: string | null, now: Date): string | null {
  if (!targetAt) {
    return null;
  }
  const remainingMs = new Date(targetAt).getTime() - now.getTime();
  if (remainingMs <= 0) {
    return 'now';
  }
  const totalMinutes = Math.round(remainingMs / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function compactSleepBody(snapshot: LiveActivityBabySnapshot): string {
  const narrative = snapshot.narrative.toLowerCase();
  if (narrative.includes('sleeping for the night')) {
    return 'Sleeping for the night';
  }
  if (narrative.includes('longer than usual')) {
    return 'Sleep running long';
  }
  if (snapshot.eventType === 'nap') {
    return 'Currently napping';
  }
  return 'Currently sleeping';
}

function isSleepingSnapshot(snapshot: LiveActivityBabySnapshot): boolean {
  return snapshot.eventType === 'sleep' || snapshot.eventType === 'nap';
}

function compactStatusLabel(snapshot: LiveActivityBabySnapshot, now: Date): string {
  if (isSleepingSnapshot(snapshot)) {
    return `Sleeping · ${snapshot.sleepSummary}`;
  }

  const remaining = formatRemainingShort(snapshot.nextTargetAt, now);
  if (snapshot.nextActionLabel && remaining) {
    return `${snapshot.nextActionLabel} due · ${remaining}`;
  }
  if (snapshot.nextActionLabel) {
    return `${snapshot.nextActionLabel} due`;
  }
  return snapshot.headline;
}

function compactBody(snapshot: LiveActivityBabySnapshot): string {
  if (snapshot.eventType === 'nap') {
    return snapshot.narrative;
  }
  if (snapshot.eventType === 'sleep') {
    return compactSleepBody(snapshot);
  }

  if (snapshot.nextActionLabel && snapshot.nextSummary) {
    return snapshot.nextSummary;
  }
  return snapshot.narrative;
}

function buildExpandedBody(snapshot: LiveActivityBabySnapshot): string {
  const lines = [
    snapshot.narrative,
    `FEED ${snapshot.feedSummary} | SLEEP ${snapshot.sleepSummary} | DIAPER ${snapshot.diaperSummary}`,
  ];
  if (snapshot.nextActionLabel && snapshot.nextSummary) {
    lines.push(`${snapshot.nextActionLabel}: ${snapshot.nextSummary}`);
  }
  return lines.join('\n');
}

function buildSummaryLine(snapshot: LiveActivityBabySnapshot, now: Date): string {
  return `${snapshot.babyName} · ${compactStatusLabel(snapshot, now)}`;
}

function buildChildNotification(
  snapshot: LiveActivityBabySnapshot,
  now: Date,
): AndroidLockScreenChildNotification {
  const whenMs = new Date(snapshot.startedAt).getTime();
  const invertedSortMs = Math.max(0, MAX_SORT_MS - whenMs);
  return {
    tag: `twintracker:baby:${snapshot.babyId}`,
    babyId: snapshot.babyId,
    title: `${snapshot.babyName} · ${compactStatusLabel(snapshot, now)}`,
    body: compactBody(snapshot),
    expandedBody: buildExpandedBody(snapshot),
    summaryLine: buildSummaryLine(snapshot, now),
    sortKey: String(invertedSortMs).padStart(String(MAX_SORT_MS).length, '0'),
    whenMs,
    accentColor: BABY_ACCENT_HEX[snapshot.babyColor] ?? '#ffffff',
  };
}

export function buildAndroidLockScreenNotificationPayload(
  snapshots: LiveActivitySnapshot[],
  now = new Date(),
): AndroidLockScreenNotificationPayload | null {
  const babies = flattenSnapshots(snapshots);
  if (babies.length === 0) {
    return null;
  }

  const children = babies
    .map(snapshot => buildChildNotification(snapshot, now))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return {
    groupKey: ANDROID_HOUSEHOLD_NOTIFICATION_GROUP_KEY,
    summaryTag: ANDROID_HOUSEHOLD_SUMMARY_TAG,
    summaryTitle: 'TwinTracker',
    summaryText:
      children.length === 1
        ? `${children[0].title} active`
        : `${children.length} children active`,
    summaryLines: children.map(child => child.summaryLine),
    children,
  };
}
