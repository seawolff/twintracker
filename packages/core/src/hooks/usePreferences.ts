import { useCallback, useEffect, useState } from 'react';
import type { StorageInterface } from '../types';
import type { TimeFormat } from '../config';
import { api } from '../api/client';

const PREFS_KEY = 'tt_prefs';

export interface Preferences {
  napCheckMinutes: number; // minutes after nap log to ask "still sleeping?", default 15
  twinSync: boolean; // suggest syncing nap/feed across babies, default false
  bedtimeHour: number; // target bedtime hour 0–23; default 19 (7pm, Stage 2+); use 22 for Stage 1 newborns
  wakeHour: number; // expected morning wake hour 0–23; default 7 (7am); also used as the daily history reset boundary
  sleepTraining: boolean; // show self-soothing wait times and guided cues during nap/sleep, default false
  liveActivitiesEnabled: boolean; // allow TwinTracker to start iOS Live Activities for active nap/sleep sessions, default false
  androidLockScreenNotificationsEnabled: boolean; // allow TwinTracker to show grouped household lock-screen notifications on Android, default false
  units: 'metric' | 'imperial'; // how weight and height are displayed; storage always kg/cm, default 'metric'
  timeFormat: TimeFormat; // how clock times are displayed; default 12-hour
}

const DEFAULT: Preferences = {
  napCheckMinutes: 15,
  twinSync: false,
  bedtimeHour: 19,
  wakeHour: 7,
  sleepTraining: false,
  liveActivitiesEnabled: false,
  androidLockScreenNotificationsEnabled: false,
  units: 'metric',
  timeFormat: '12h',
};

export function normalizePreferences(
  raw?: Partial<Preferences> | Record<string, unknown> | null,
): Preferences {
  const source = {
    ...(raw ?? {}),
  } as Partial<Preferences> & {
    widgetsEnabled?: boolean;
    androidNotificationsEnabled?: boolean;
  };
  if (source.liveActivitiesEnabled == null && typeof source.widgetsEnabled === 'boolean') {
    source.liveActivitiesEnabled = source.widgetsEnabled;
  }
  if (
    source.androidLockScreenNotificationsEnabled == null &&
    typeof source.androidNotificationsEnabled === 'boolean'
  ) {
    source.androidLockScreenNotificationsEnabled = source.androidNotificationsEnabled;
  }
  delete (source as { widgetsEnabled?: boolean }).widgetsEnabled;
  delete (source as { androidNotificationsEnabled?: boolean }).androidNotificationsEnabled;
  return { ...DEFAULT, ...source };
}

function webStorage(): StorageInterface | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

function readSync(storage: StorageInterface | null): Preferences {
  if (!storage) {
    return DEFAULT;
  }
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (typeof raw === 'string') {
      return normalizePreferences(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export async function readStoredPreferences(
  storage: StorageInterface | null,
): Promise<{ exists: boolean; prefs: Preferences }> {
  if (!storage) {
    return { exists: false, prefs: DEFAULT };
  }
  try {
    const raw = await Promise.resolve(storage.getItem(PREFS_KEY));
    if (typeof raw === 'string') {
      return { exists: true, prefs: normalizePreferences(JSON.parse(raw)) };
    }
  } catch {
    /* ignore */
  }
  return { exists: false, prefs: DEFAULT };
}

export function usePreferences(storage?: StorageInterface): {
  prefs: Preferences;
  setNapCheckMinutes: (minutes: number) => void;
  setTwinSync: (enabled: boolean) => void;
  setBedtimeHour: (hour: number) => void;
  setWakeHour: (hour: number) => void;
  setSleepTraining: (enabled: boolean) => void;
  setLiveActivitiesEnabled: (enabled: boolean) => void;
  setAndroidLockScreenNotificationsEnabled: (enabled: boolean) => void;
  setUnits: (units: 'metric' | 'imperial') => void;
  setTimeFormat: (timeFormat: TimeFormat) => void;
};
export function usePreferences(
  storage?: StorageInterface,
  apiSyncEnabled?: boolean,
): {
  prefs: Preferences;
  setNapCheckMinutes: (minutes: number) => void;
  setTwinSync: (enabled: boolean) => void;
  setBedtimeHour: (hour: number) => void;
  setWakeHour: (hour: number) => void;
  setSleepTraining: (enabled: boolean) => void;
  setLiveActivitiesEnabled: (enabled: boolean) => void;
  setAndroidLockScreenNotificationsEnabled: (enabled: boolean) => void;
  setUnits: (units: 'metric' | 'imperial') => void;
  setTimeFormat: (timeFormat: TimeFormat) => void;
};
export function usePreferences(
  storage?: StorageInterface,
  apiSyncEnabled = true,
): {
  prefs: Preferences;
  setNapCheckMinutes: (minutes: number) => void;
  setTwinSync: (enabled: boolean) => void;
  setBedtimeHour: (hour: number) => void;
  setWakeHour: (hour: number) => void;
  setSleepTraining: (enabled: boolean) => void;
  setLiveActivitiesEnabled: (enabled: boolean) => void;
  setAndroidLockScreenNotificationsEnabled: (enabled: boolean) => void;
  setUnits: (units: 'metric' | 'imperial') => void;
  setTimeFormat: (timeFormat: TimeFormat) => void;
} {
  const [prefs, setPrefs] = useState<Preferences>(() => readSync(storage ?? webStorage()));

  // Async init for native (AsyncStorage is async — web localStorage is sync so this is a no-op there)
  useEffect(() => {
    const store = storage ?? webStorage();
    if (!store) {
      return;
    }
    const raw = store.getItem(PREFS_KEY);
    if (raw instanceof Promise) {
      raw.then(val => {
        if (typeof val === 'string') {
          try {
            setPrefs(prev => ({ ...prev, ...JSON.parse(val) }));
          } catch {
            /* ignore */
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once authenticated, fetch from API to hydrate a fresh device that has no local data.
  // If local data already exists (or appears while the request is in-flight), skip the overwrite.
  useEffect(() => {
    if (!apiSyncEnabled) {
      return;
    }
    const store = storage ?? webStorage();
    let cancelled = false;

    const hydrateFromApi = async () => {
      try {
        const localBeforeFetch = await readStoredPreferences(store);
        if (cancelled || localBeforeFetch.exists) {
          return;
        }
        const remote = await api.preferences.get();
        const localAfterFetch = await readStoredPreferences(store);
        if (cancelled || localAfterFetch.exists) {
          return;
        }
        const merged = normalizePreferences(remote);
        setPrefs(merged);
        if (store) {
          await Promise.resolve(store.setItem(PREFS_KEY, JSON.stringify(merged)));
        }
      } catch {
        /* not logged in or offline — keep local values */
      }
    };

    hydrateFromApi();
    return () => {
      cancelled = true;
    };
  }, [apiSyncEnabled, storage]);

  // Write to local storage immediately and sync to API in the background
  const save = useCallback(
    (next: Preferences) => {
      setPrefs(next);
      const store = storage ?? webStorage();
      if (store) {
        store.setItem(PREFS_KEY, JSON.stringify(next));
      }
      api.preferences.put(next as unknown as Record<string, unknown>).catch(() => {
        /* offline — local write sufficient */
      });
    },
    [storage],
  );

  const setNapCheckMinutes = useCallback(
    (minutes: number) => save({ ...prefs, napCheckMinutes: minutes }),
    [prefs, save],
  );

  const setTwinSync = useCallback(
    (enabled: boolean) => save({ ...prefs, twinSync: enabled }),
    [prefs, save],
  );

  const setBedtimeHour = useCallback(
    (hour: number) => save({ ...prefs, bedtimeHour: hour }),
    [prefs, save],
  );

  const setWakeHour = useCallback(
    (hour: number) => save({ ...prefs, wakeHour: hour }),
    [prefs, save],
  );

  const setSleepTraining = useCallback(
    (enabled: boolean) => save({ ...prefs, sleepTraining: enabled }),
    [prefs, save],
  );

  const setLiveActivitiesEnabled = useCallback(
    (enabled: boolean) => save({ ...prefs, liveActivitiesEnabled: enabled }),
    [prefs, save],
  );

  const setAndroidLockScreenNotificationsEnabled = useCallback(
    (enabled: boolean) => save({ ...prefs, androidLockScreenNotificationsEnabled: enabled }),
    [prefs, save],
  );

  const setUnits = useCallback(
    (units: 'metric' | 'imperial') => save({ ...prefs, units }),
    [prefs, save],
  );

  const setTimeFormat = useCallback(
    (timeFormat: TimeFormat) => save({ ...prefs, timeFormat }),
    [prefs, save],
  );

  return {
    prefs,
    setNapCheckMinutes,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setLiveActivitiesEnabled,
    setAndroidLockScreenNotificationsEnabled,
    setUnits,
    setTimeFormat,
  };
}
