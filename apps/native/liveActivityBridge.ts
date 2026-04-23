import { NativeModules, Platform } from 'react-native';
import type { LiveActivitySnapshot } from '@tt/core';

type LiveActivityModuleType = {
  syncActivities(json: string): Promise<void>;
  clearActivities(): Promise<void>;
};

const moduleRef: LiveActivityModuleType | null =
  Platform.OS === 'ios'
    ? ((NativeModules.LiveActivityModule as LiveActivityModuleType | undefined) ?? null)
    : null;

export async function syncLiveActivities(snapshots: LiveActivitySnapshot[]): Promise<void> {
  if (!moduleRef) {
    return;
  }
  await moduleRef.syncActivities(JSON.stringify(snapshots));
}

export async function clearLiveActivities(): Promise<void> {
  if (!moduleRef) {
    return;
  }
  await moduleRef.clearActivities();
}
