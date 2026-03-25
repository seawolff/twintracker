import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';
import type { Baby, LatestEventMap } from '@tt/core';
import { getNextAction } from '@tt/core';

export const ALARM_CHANNEL_ID = 'tt-alarms';

/** Call once at app startup (Android only — no-op on iOS). */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: 'TwinTracker Alarms',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Request permission and return whether it was granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule a one-shot alarm notification in `ms` milliseconds.
 * Returns true if scheduled, false if skipped (too soon).
 * Throws if permission is denied or scheduling fails.
 */
export async function scheduleAlarm(ms: number, title: string, body: string): Promise<boolean> {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 30) {
    return false;
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL_ID } : {}),
    },
  });
  return true;
}

/**
 * Schedule a nap-check notification with napId in data so the response
 * listener can delete or dismiss the event.
 */
export async function scheduleNapCheck(
  napId: string,
  babyName: string,
  napCheckMinutes: number,
): Promise<string> {
  const seconds = napCheckMinutes * 60;
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TwinTracker',
      body: `You put ${babyName} to bed ${napCheckMinutes} min ago. Are they asleep?`,
      sound: true,
      data: { napId, babyName },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL_ID } : {}),
    },
  });
  return identifier;
}

/** Cancel a previously scheduled nap check notification. */
export async function cancelNapCheck(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

/**
 * Schedule an alarm notification to fire at a specific ISO timestamp.
 * Returns the notification identifier, or null if the fire time is too soon (<30s).
 */
export async function scheduleAlarmAt(
  firesAt: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  const seconds = Math.floor((new Date(firesAt).getTime() - Date.now()) / 1000);
  if (seconds < 30) {
    return null;
  }
  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL_ID } : {}),
    },
  });
  return identifier;
}

/**
 * Cancel all scheduled notifications and reschedule based on current state.
 * Fires a reminder 5 minutes before each baby's next action is due.
 */
export async function scheduleReminders(babies: Baby[], latest: LatestEventMap): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  for (const baby of babies) {
    const next = getNextAction(latest, baby.id, now);

    // Already overdue — no future notification to schedule
    if (next.targetMs <= 0) {
      continue;
    }

    // Fire 5 minutes before the window closes
    const fireMs = next.targetMs - 5 * 60_000;
    if (fireMs < 30_000) {
      continue;
    } // too soon to be worth scheduling

    await Notifications.scheduleNotificationAsync({
      content: {
        title: baby.name,
        body: next.action,
        sound: true,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.floor(fireMs / 1000),
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL_ID } : {}),
      },
    });
  }
}
