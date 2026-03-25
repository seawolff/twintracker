import { useCallback, useEffect, useState } from 'react';
import type { StorageInterface } from '../types';
import { api } from '../api/client';

const PREFS_KEY = 'tt_prefs';

export interface Preferences {
  napCheckMinutes: number; // minutes after nap log to ask "still sleeping?", default 15
  twinSync: boolean; // suggest syncing nap/feed across babies, default false
  bedtimeHour: number; // target bedtime hour 0–23; default 19 (7pm, Stage 2+); use 22 for Stage 1 newborns
  wakeHour: number; // expected morning wake hour 0–23; default 7 (7am); also used as the daily history reset boundary
  sleepTraining: boolean; // show self-soothing wait times and guided cues during nap/sleep, default false
  diaperNotifications: boolean; // push notification ~3h after last diaper change, default true
  bottleNotifications: boolean; // push notification when next feed is predicted due, default true
}

const DEFAULT: Preferences = {
  napCheckMinutes: 15,
  twinSync: false,
  bedtimeHour: 19,
  wakeHour: 7,
  sleepTraining: false,
  diaperNotifications: true,
  bottleNotifications: true,
};

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
      return { ...DEFAULT, ...JSON.parse(raw) };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export function usePreferences(storage?: StorageInterface): {
  prefs: Preferences;
  setNapCheckMinutes: (minutes: number) => void;
  setTwinSync: (enabled: boolean) => void;
  setBedtimeHour: (hour: number) => void;
  setWakeHour: (hour: number) => void;
  setSleepTraining: (enabled: boolean) => void;
  setDiaperNotifications: (enabled: boolean) => void;
  setBottleNotifications: (enabled: boolean) => void;
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

  // On mount, fetch from API — authoritative cross-device state wins over local cache
  useEffect(() => {
    api.preferences
      .get()
      .then(remote => {
        const merged: Preferences = { ...DEFAULT, ...remote };
        setPrefs(merged);
        const store = storage ?? webStorage();
        if (store) {
          store.setItem(PREFS_KEY, JSON.stringify(merged));
        }
      })
      .catch(() => {
        /* not logged in or offline — keep local values */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setDiaperNotifications = useCallback(
    (enabled: boolean) => save({ ...prefs, diaperNotifications: enabled }),
    [prefs, save],
  );

  const setBottleNotifications = useCallback(
    (enabled: boolean) => save({ ...prefs, bottleNotifications: enabled }),
    [prefs, save],
  );

  return {
    prefs,
    setNapCheckMinutes,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setDiaperNotifications,
    setBottleNotifications,
  };
}
