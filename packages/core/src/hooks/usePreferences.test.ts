import { normalizePreferences, readStoredPreferences } from './usePreferences';
import type { StorageInterface } from '../types';

describe('normalizePreferences', () => {
  it('defaults native lock-screen preferences to false for fresh preferences', () => {
    const prefs = normalizePreferences();

    expect(prefs.liveActivitiesEnabled).toBe(false);
    expect(prefs.androidLockScreenNotificationsEnabled).toBe(false);
    expect(prefs.timeFormat).toBe('12h');
  });

  it('preserves a stored liveActivitiesEnabled value while keeping other defaults', () => {
    const prefs = normalizePreferences({ liveActivitiesEnabled: true });

    expect(prefs.liveActivitiesEnabled).toBe(true);
    expect(prefs.sleepTraining).toBe(false);
    expect(prefs.units).toBe('metric');
    expect(prefs.timeFormat).toBe('12h');
  });

  it('migrates the legacy widgetsEnabled value into liveActivitiesEnabled', () => {
    const prefs = normalizePreferences({
      widgetsEnabled: true,
      wakeHour: 6,
      bedtimeHour: 20,
    });

    expect(prefs.liveActivitiesEnabled).toBe(true);
    expect(prefs.wakeHour).toBe(6);
    expect(prefs.bedtimeHour).toBe(20);
  });

  it('migrates the legacy androidNotificationsEnabled value into androidLockScreenNotificationsEnabled', () => {
    const prefs = normalizePreferences({
      androidNotificationsEnabled: true,
      wakeHour: 6,
    });

    expect(prefs.androidLockScreenNotificationsEnabled).toBe(true);
    expect(prefs.wakeHour).toBe(6);
  });
});

describe('readStoredPreferences', () => {
  it('returns exists false when async storage has no saved preferences', async () => {
    const storage: StorageInterface = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    await expect(readStoredPreferences(storage)).resolves.toEqual({
      exists: false,
      prefs: normalizePreferences(),
    });
  });

  it('reads saved preferences from async storage', async () => {
    const storage: StorageInterface = {
      getItem: async () =>
        JSON.stringify({
          wakeHour: 6,
          timeFormat: '24h',
          liveActivitiesEnabled: true,
          androidLockScreenNotificationsEnabled: true,
        }),
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    await expect(readStoredPreferences(storage)).resolves.toEqual({
      exists: true,
      prefs: normalizePreferences({
        wakeHour: 6,
        timeFormat: '24h',
        liveActivitiesEnabled: true,
        androidLockScreenNotificationsEnabled: true,
      }),
    });
  });
});
