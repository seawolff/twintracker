import { NativeModules, Platform } from 'react-native';
import type { AndroidLockScreenNotificationPayload } from '@tt/core';

type AndroidLockScreenModuleType = {
  syncNotifications(json: string): Promise<void>;
  clearNotifications(): Promise<void>;
};

const moduleRef: AndroidLockScreenModuleType | null =
  Platform.OS === 'android'
    ? ((NativeModules.AndroidLockScreenModule as AndroidLockScreenModuleType | undefined) ?? null)
    : null;

export async function syncAndroidLockScreenNotifications(
  payload: AndroidLockScreenNotificationPayload,
): Promise<void> {
  if (!moduleRef) {
    console.log('[AndroidLockScreenBridge] native module unavailable');
    return;
  }
  console.log('[AndroidLockScreenBridge] syncing payload', {
    summaryText: payload.summaryText,
    childCount: payload.children.length,
    childTitles: payload.children.map(child => child.title),
  });
  await moduleRef.syncNotifications(JSON.stringify(payload));
}

export async function clearAndroidLockScreenNotifications(): Promise<void> {
  if (!moduleRef) {
    console.log('[AndroidLockScreenBridge] native module unavailable during clear');
    return;
  }
  console.log('[AndroidLockScreenBridge] clearing notifications');
  await moduleRef.clearNotifications();
}
