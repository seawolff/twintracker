import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

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
 * Schedule a notification to fire at a specific ISO timestamp.
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
