/**
 * twinSync.ts — shared helpers for twin-schedule sync suggestions and
 * active nap/sleep event detection.
 *
 * Both web (home/page.tsx) and native (App.tsx) use identical logic for these;
 * keeping it here ensures a single source of truth.
 */

import type { Baby, EventType, LatestEventMap, TrackerEvent } from '../types';

// Staleness thresholds — how long ago the other baby's last event must be
// before we suggest syncing.
const FEED_STALE_MS = 30 * 60_000; // 30 min  (bottle / nursing)
const DIAPER_STALE_MS = 60 * 60_000; // 1 hour  (diaper)
const FOOD_STALE_MS = 2 * 60 * 60_000; // 2 hours (solid food)

export type SyncableEventType = Extract<
  EventType,
  'nap' | 'bottle' | 'nursing' | 'diaper' | 'food'
>;

/**
 * After logging an event for one baby, finds the other baby who is "out of sync"
 * and should receive a one-tap sync suggestion banner.
 *
 * Returns undefined if twinSync should not fire (only one baby, same baby,
 * or the other baby already has a recent matching event).
 *
 * @param type          The event type just logged
 * @param loggedBabyId  The baby the event was just logged for
 * @param babies        All babies in the household
 * @param latest        Latest event map from useEventStore
 * @param now           Current timestamp in ms (defaults to Date.now(); injectable for tests)
 */
export function findUnsyncedBaby(
  type: SyncableEventType,
  loggedBabyId: string,
  babies: Baby[],
  latest: LatestEventMap,
  now = Date.now(),
): Baby | undefined {
  return babies.find(b => {
    if (b.id === loggedBabyId) {
      return false;
    }

    if (type === 'nap') {
      // Suggest nap sync any time the other baby's last nap is absent or already ended.
      const napEv = latest[`${b.id}:nap`];
      return !napEv || !!napEv.endedAt;
    }

    if (type === 'bottle' || type === 'nursing') {
      // Check both bottle and nursing — a nursing session counts as a recent feed.
      const lastFeed = latest[`${b.id}:bottle`] ?? latest[`${b.id}:nursing`];
      if (!lastFeed) {
        return true;
      }
      return now - new Date(lastFeed.startedAt).getTime() > FEED_STALE_MS;
    }

    if (type === 'diaper') {
      const lastDiaper = latest[`${b.id}:diaper`];
      if (!lastDiaper) {
        return true;
      }
      return now - new Date(lastDiaper.startedAt).getTime() > DIAPER_STALE_MS;
    }

    if (type === 'food') {
      const lastFood = latest[`${b.id}:food`];
      if (!lastFood) {
        return true;
      }
      return now - new Date(lastFood.startedAt).getTime() > FOOD_STALE_MS;
    }

    return false;
  });
}

/**
 * Returns the currently-active nap or sleep event for a baby, or null if none.
 * Used in handleLog to decide whether to close the event (wake) vs. open the log sheet.
 *
 * @param babyId  Baby to check
 * @param type    'nap' or 'sleep'
 * @param latest  Latest event map from useEventStore
 */
export function getActiveEvent(
  babyId: string,
  type: 'nap' | 'sleep',
  latest: LatestEventMap,
): TrackerEvent | null {
  const event = latest[`${babyId}:${type}`];
  return event && !event.endedAt ? event : null;
}

/**
 * Returns the EventType to pass to onLog when the nap/sleep button is pressed.
 *
 * When a baby is currently sleeping (napWaking=true), we must use the type of
 * the actual active event, not the current time-mode type. Without this, a
 * baby put to sleep at night (type='sleep') would emit type='nap' in the
 * morning when isSleepMode=false, causing the wake handler to find no active
 * event and fall through to opening the log sheet instead.
 *
 * When not waking (starting a new sleep), use the time-mode type so that
 * daytime logs as 'nap' and night/bedtime logs as 'sleep'.
 */
export function getNapActionType(
  napIsActive: boolean,
  sleepIsActive: boolean,
  isSleepMode: boolean,
): 'nap' | 'sleep' {
  const napWaking = napIsActive || sleepIsActive;
  if (napWaking) {
    return sleepIsActive ? 'sleep' : 'nap';
  }
  return isSleepMode ? 'sleep' : 'nap';
}

/**
 * When waking one baby, checks whether the other baby has an active nap/sleep
 * that started within `thresholdMs` of the closing baby's event — indicating
 * it was likely started via twin sync. Returns the other baby if found, so the
 * caller can offer a "Wake both?" prompt.
 *
 * @param closingBabyId        Baby being woken up
 * @param closingEvent         The active nap/sleep event being closed
 * @param babies               All babies in the household
 * @param latest               Latest event map from useEventStore
 * @param thresholdMs          Max gap between start times to consider synced (default 5 min)
 */
export function findSyncedNapBaby(
  closingBabyId: string,
  closingEvent: TrackerEvent,
  babies: Baby[],
  latest: LatestEventMap,
  thresholdMs = 5 * 60_000,
): Baby | undefined {
  return babies.find(b => {
    if (b.id === closingBabyId) {
      return false;
    }
    const napEv = latest[`${b.id}:nap`] ?? latest[`${b.id}:sleep`];
    if (!napEv || napEv.endedAt) {
      return false;
    }
    const diff = Math.abs(
      new Date(napEv.startedAt).getTime() - new Date(closingEvent.startedAt).getTime(),
    );
    return diff <= thresholdMs;
  });
}
