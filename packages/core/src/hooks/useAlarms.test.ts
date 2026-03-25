/**
 * Tests for alarm system logic.
 *
 * Covers:
 *  1. Alarm window guard — showAlarmButton conditions
 *  2. Alarm state management (create, dismiss, reschedule, getAlarmForBaby)
 *  3. Cross-device dismiss reconciliation (alarm gone from active list)
 *  4. badgeCountdown format helper
 *  5. scheduleAlarmAt seconds threshold
 */
import type { NapAlarm } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAlarm(overrides: Partial<NapAlarm> = {}): NapAlarm {
  return {
    id: 'alarm-1',
    babyId: 'baby-1',
    householdId: 'hh-1',
    firesAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    durationMs: 15 * 60_000,
    label: 'Your 15 min timer is up. Do you need to check on Baby?',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mirror of BabyCard showAlarmButton guard
function computeShowAlarmButton(opts: {
  hasActiveNap: boolean;
  napAgeMs: number;
  sleepTraining: boolean;
  selfSoothingMinutes: number;
  napCheckMinutes: number;
  hasActiveAlarm: boolean;
  onSetAlarmProvided: boolean;
}): boolean {
  const {
    hasActiveNap,
    napAgeMs,
    sleepTraining,
    selfSoothingMinutes,
    napCheckMinutes,
    hasActiveAlarm,
    onSetAlarmProvided,
  } = opts;
  const windowMs = sleepTraining ? selfSoothingMinutes * 60_000 : napCheckMinutes * 60_000;
  return hasActiveNap && napAgeMs <= windowMs && !hasActiveAlarm && onSetAlarmProvided;
}

// Mirror of badgeCountdown from BabyCard
function badgeCountdown(firesAt: string, nowMs = Date.now()): string {
  const ms = Math.max(0, new Date(firesAt).getTime() - nowMs);
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// Mirror of scheduleAlarmAt threshold check (< 30s → skip)
function shouldScheduleAlarm(firesAt: string, nowMs = Date.now()): boolean {
  const seconds = Math.floor((new Date(firesAt).getTime() - nowMs) / 1000);
  return seconds >= 30;
}

// Mirror of alarm state management from useAlarms
function applyCreate(alarms: NapAlarm[], alarm: NapAlarm): NapAlarm[] {
  // auto-dismiss existing for same baby (server does this, client mirrors it)
  return [...alarms.filter(a => a.babyId !== alarm.babyId), alarm];
}

function applyDismiss(alarms: NapAlarm[], id: string): NapAlarm[] {
  return alarms.filter(a => a.id !== id);
}

function applyReschedule(
  alarms: NapAlarm[],
  id: string,
  firesAt: string,
  durationMs: number,
): NapAlarm[] {
  return alarms.map(a => (a.id === id ? { ...a, firesAt, durationMs } : a));
}

function getAlarmForBaby(alarms: NapAlarm[], babyId: string): NapAlarm | undefined {
  return alarms.find(a => a.babyId === babyId);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('showAlarmButton guard', () => {
  const base = {
    hasActiveNap: true,
    napAgeMs: 5 * 60_000, // 5 min old
    sleepTraining: false,
    selfSoothingMinutes: 20,
    napCheckMinutes: 15,
    hasActiveAlarm: false,
    onSetAlarmProvided: true,
  };

  test('shows when nap is active and within window', () => {
    expect(computeShowAlarmButton(base)).toBe(true);
  });

  test('hidden when no active nap', () => {
    expect(computeShowAlarmButton({ ...base, hasActiveNap: false })).toBe(false);
  });

  test('hidden when nap age exceeds napCheckMinutes window (non-sleep-training)', () => {
    // napCheckMinutes=15 → window=900_000ms; napAge=16min > window
    expect(computeShowAlarmButton({ ...base, napAgeMs: 16 * 60_000 })).toBe(false);
  });

  test('shows when nap age exactly equals window boundary', () => {
    expect(computeShowAlarmButton({ ...base, napAgeMs: 15 * 60_000 })).toBe(true);
  });

  test('hidden when alarm already active', () => {
    expect(computeShowAlarmButton({ ...base, hasActiveAlarm: true })).toBe(false);
  });

  test('hidden when onSetAlarm not provided', () => {
    expect(computeShowAlarmButton({ ...base, onSetAlarmProvided: false })).toBe(false);
  });

  describe('sleep training mode', () => {
    const stBase = { ...base, sleepTraining: true, selfSoothingMinutes: 20 };

    test('uses selfSoothingMinutes as window (nap within)', () => {
      // 19 min < 20 min window
      expect(computeShowAlarmButton({ ...stBase, napAgeMs: 19 * 60_000 })).toBe(true);
    });

    test('uses selfSoothingMinutes as window (nap exceeds)', () => {
      // 21 min > 20 min window
      expect(computeShowAlarmButton({ ...stBase, napAgeMs: 21 * 60_000 })).toBe(false);
    });

    test('sleep training window is independent of napCheckMinutes', () => {
      // sleepTraining=true, selfSoothingMinutes=20, napCheckMinutes=15
      // nap is 16 min old — past napCheck window but within selfSoothing
      expect(
        computeShowAlarmButton({ ...stBase, napAgeMs: 16 * 60_000, napCheckMinutes: 15 }),
      ).toBe(true);
    });
  });
});

describe('alarm state management', () => {
  test('create adds alarm and replaces existing for same baby', () => {
    const existing = makeAlarm({ id: 'old-1', babyId: 'baby-1' });
    const fresh = makeAlarm({ id: 'new-1', babyId: 'baby-1' });
    const result = applyCreate([existing], fresh);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new-1');
  });

  test('create does not affect alarms for other babies', () => {
    const other = makeAlarm({ id: 'other-1', babyId: 'baby-2' });
    const fresh = makeAlarm({ id: 'new-1', babyId: 'baby-1' });
    const result = applyCreate([other], fresh);
    expect(result).toHaveLength(2);
  });

  test('dismiss removes alarm by id', () => {
    const alarm = makeAlarm({ id: 'alarm-1' });
    const result = applyDismiss([alarm], 'alarm-1');
    expect(result).toHaveLength(0);
  });

  test('dismiss leaves other alarms intact', () => {
    const a1 = makeAlarm({ id: 'alarm-1', babyId: 'baby-1' });
    const a2 = makeAlarm({ id: 'alarm-2', babyId: 'baby-2' });
    const result = applyDismiss([a1, a2], 'alarm-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('alarm-2');
  });

  test('reschedule updates firesAt and durationMs', () => {
    const alarm = makeAlarm({ id: 'alarm-1', durationMs: 15 * 60_000 });
    const newFiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const result = applyReschedule([alarm], 'alarm-1', newFiresAt, 30 * 60_000);
    expect(result[0].firesAt).toBe(newFiresAt);
    expect(result[0].durationMs).toBe(30 * 60_000);
  });

  test('reschedule leaves other alarms unchanged', () => {
    const a1 = makeAlarm({ id: 'alarm-1', babyId: 'baby-1' });
    const a2 = makeAlarm({ id: 'alarm-2', babyId: 'baby-2', durationMs: 10 * 60_000 });
    const result = applyReschedule([a1, a2], 'alarm-1', new Date().toISOString(), 5 * 60_000);
    expect(result.find(a => a.id === 'alarm-2')?.durationMs).toBe(10 * 60_000);
  });
});

describe('getAlarmForBaby', () => {
  test('finds alarm by babyId', () => {
    const alarm = makeAlarm({ babyId: 'baby-1' });
    expect(getAlarmForBaby([alarm], 'baby-1')).toBe(alarm);
  });

  test('returns undefined when no alarm for baby', () => {
    const alarm = makeAlarm({ babyId: 'baby-2' });
    expect(getAlarmForBaby([alarm], 'baby-1')).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(getAlarmForBaby([], 'baby-1')).toBeUndefined();
  });
});

describe('cross-device dismiss reconciliation', () => {
  test('alarm missing from active list signals local cancellation needed', () => {
    // Simulate: local state has alarmId tracked, but server returns empty active list
    const trackedAlarmId = 'alarm-1';
    const activeAlarms: NapAlarm[] = []; // poll returned nothing
    const needsCancel = !activeAlarms.find(a => a.id === trackedAlarmId);
    expect(needsCancel).toBe(true);
  });

  test('alarm present in active list does not need cancellation', () => {
    const alarm = makeAlarm({ id: 'alarm-1' });
    const activeAlarms: NapAlarm[] = [alarm];
    const needsCancel = !activeAlarms.find(a => a.id === 'alarm-1');
    expect(needsCancel).toBe(false);
  });
});

describe('badgeCountdown', () => {
  test('formats remaining time as Xm YYs', () => {
    const now = Date.now();
    const firesAt = new Date(now + 19 * 60_000 + 56_000).toISOString(); // 19m 56s
    expect(badgeCountdown(firesAt, now)).toBe('19m 56s');
  });

  test('pads seconds with leading zero', () => {
    const now = Date.now();
    const firesAt = new Date(now + 1 * 60_000 + 5_000).toISOString(); // 1m 05s
    expect(badgeCountdown(firesAt, now)).toBe('1m 05s');
  });

  test('shows 0m 00s when alarm has fired', () => {
    const now = Date.now();
    const firesAt = new Date(now - 1000).toISOString(); // already past
    expect(badgeCountdown(firesAt, now)).toBe('0m 00s');
  });

  test('shows full minutes correctly', () => {
    const now = Date.now();
    const firesAt = new Date(now + 60_000).toISOString(); // exactly 1 min
    expect(badgeCountdown(firesAt, now)).toBe('1m 00s');
  });
});

// Mirror of handleSetAlarm notification-scheduling logic (native)
function simulateNativeSetAlarm(
  firesAt: string,
  scheduleAlarmAt: (firesAt: string) => string | null,
): { notifId: string | null; notifScheduled: boolean } {
  const notifId = scheduleAlarmAt(firesAt);
  return { notifId, notifScheduled: notifId !== null };
}

// Mirror of handleSetAlarm notification-scheduling logic (web)
// Timer is now always set when delayMs > 0 — the callback shows an in-app banner,
// not a browser Notification, so permission is no longer a prerequisite.
function simulateWebSetAlarm(opts: { firesAt: string; nowMs?: number }): { timerSet: boolean } {
  const { firesAt, nowMs = Date.now() } = opts;
  const delayMs = new Date(firesAt).getTime() - nowMs;
  const timerSet = delayMs > 0;
  return { timerSet };
}

// Mirror of native cold-launch pending logic:
// handleAlarmFired stores pending when babies/events aren't loaded yet.
function simulateColdLaunchAlarm(opts: {
  babiesLoaded: boolean;
  eventsLoading: boolean;
  babyId: string | undefined;
}): { storesPending: boolean; showsPromptImmediately: boolean } {
  const { babiesLoaded, eventsLoading, babyId } = opts;
  if (!babyId || !babiesLoaded || eventsLoading) {
    return { storesPending: !!babyId, showsPromptImmediately: false };
  }
  return { storesPending: false, showsPromptImmediately: true };
}

// Mirror of web visibilitychange pending drain logic.
function simulateVisibilityChangeDrain(opts: {
  pendingCount: number;
  activeNapId: string | undefined;
}): { bannersShown: number } {
  const { pendingCount, activeNapId } = opts;
  if (pendingCount === 0 || !activeNapId) {
    return { bannersShown: 0 };
  }
  return { bannersShown: 1 };
}

// Mirror of the "Still sleeping?" banner logic that fires when the alarm setTimeout fires (web)
// and the Alert.alert that fires when the notification is tapped (native).
function simulateStillSleepingPrompt(opts: {
  isCustomTimer: boolean;
  activeNapId: string | undefined;
  twinSync: boolean;
  otherBabyActiveNapId: string | undefined;
}): { showsPrompt: boolean; showsSecondPrompt: boolean } {
  const { isCustomTimer, activeNapId, twinSync, otherBabyActiveNapId } = opts;
  if (isCustomTimer || !activeNapId) {
    return { showsPrompt: false, showsSecondPrompt: false };
  }
  const showsSecondPrompt = twinSync && !!otherBabyActiveNapId;
  return { showsPrompt: true, showsSecondPrompt };
}

describe('handleSetAlarm — notification scheduling', () => {
  describe('native: scheduleAlarmAt called after createAlarm', () => {
    test('notification scheduled when alarm is in the future (> 30s)', () => {
      const firesAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { notifScheduled } = simulateNativeSetAlarm(firesAt, f => {
        const sec = Math.floor((new Date(f).getTime() - Date.now()) / 1000);
        return sec >= 30 ? 'notif-id-123' : null;
      });
      expect(notifScheduled).toBe(true);
    });

    test('notification skipped when alarm fires in < 30s', () => {
      const firesAt = new Date(Date.now() + 10_000).toISOString();
      const { notifScheduled } = simulateNativeSetAlarm(firesAt, f => {
        const sec = Math.floor((new Date(f).getTime() - Date.now()) / 1000);
        return sec >= 30 ? 'notif-id-123' : null;
      });
      expect(notifScheduled).toBe(false);
    });

    test('notifId stored when scheduleAlarmAt returns an id', () => {
      const firesAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { notifId } = simulateNativeSetAlarm(firesAt, () => 'notif-id-abc');
      expect(notifId).toBe('notif-id-abc');
    });
  });

  describe('web: setTimeout started after createAlarm (in-app banner, no permission needed)', () => {
    test('timer set when alarm is in the future', () => {
      const firesAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { timerSet } = simulateWebSetAlarm({ firesAt });
      expect(timerSet).toBe(true);
    });

    test('timer not set when delayMs <= 0 (alarm already past)', () => {
      const nowMs = Date.now();
      const firesAt = new Date(nowMs - 1000).toISOString();
      const { timerSet } = simulateWebSetAlarm({ firesAt, nowMs });
      expect(timerSet).toBe(false);
    });

    test('delay is calculated from firesAt minus now', () => {
      const nowMs = 1_700_000_000_000;
      const delayWanted = 20 * 60_000;
      const firesAt = new Date(nowMs + delayWanted).toISOString();
      const delayMs = new Date(firesAt).getTime() - nowMs;
      expect(delayMs).toBe(delayWanted);
    });
  });

  describe('still sleeping prompt (native alert + web banner)', () => {
    test('shown for nap-check alarm with active nap', () => {
      const { showsPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: false,
        activeNapId: 'nap-1',
        twinSync: false,
        otherBabyActiveNapId: undefined,
      });
      expect(showsPrompt).toBe(true);
    });

    test('suppressed for custom timer', () => {
      const { showsPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: true,
        activeNapId: 'nap-1',
        twinSync: false,
        otherBabyActiveNapId: undefined,
      });
      expect(showsPrompt).toBe(false);
    });

    test('suppressed when baby has no active nap when alarm fires', () => {
      const { showsPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: false,
        activeNapId: undefined,
        twinSync: false,
        otherBabyActiveNapId: undefined,
      });
      expect(showsPrompt).toBe(false);
    });

    test('second prompt shown when twin sync on and other baby also napping', () => {
      const { showsPrompt, showsSecondPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: false,
        activeNapId: 'nap-1',
        twinSync: true,
        otherBabyActiveNapId: 'nap-2',
      });
      expect(showsPrompt).toBe(true);
      expect(showsSecondPrompt).toBe(true);
    });

    test('second prompt suppressed when twin sync on but other baby not napping', () => {
      const { showsSecondPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: false,
        activeNapId: 'nap-1',
        twinSync: true,
        otherBabyActiveNapId: undefined,
      });
      expect(showsSecondPrompt).toBe(false);
    });

    test('second prompt suppressed when twin sync off even if other baby is napping', () => {
      const { showsSecondPrompt } = simulateStillSleepingPrompt({
        isCustomTimer: false,
        activeNapId: 'nap-1',
        twinSync: false,
        otherBabyActiveNapId: 'nap-2',
      });
      expect(showsSecondPrompt).toBe(false);
    });
  });

  describe('native cold launch — pending alarm deferred until state loads', () => {
    test('stores pending when babies not yet loaded', () => {
      const { storesPending, showsPromptImmediately } = simulateColdLaunchAlarm({
        babiesLoaded: false,
        eventsLoading: false,
        babyId: 'baby-1',
      });
      expect(storesPending).toBe(true);
      expect(showsPromptImmediately).toBe(false);
    });

    test('stores pending when events still loading', () => {
      const { storesPending, showsPromptImmediately } = simulateColdLaunchAlarm({
        babiesLoaded: true,
        eventsLoading: true,
        babyId: 'baby-1',
      });
      expect(storesPending).toBe(true);
      expect(showsPromptImmediately).toBe(false);
    });

    test('shows prompt immediately when state is already loaded', () => {
      const { storesPending, showsPromptImmediately } = simulateColdLaunchAlarm({
        babiesLoaded: true,
        eventsLoading: false,
        babyId: 'baby-1',
      });
      expect(storesPending).toBe(false);
      expect(showsPromptImmediately).toBe(true);
    });

    test('does not store pending when babyId is missing from notification data', () => {
      const { storesPending } = simulateColdLaunchAlarm({
        babiesLoaded: false,
        eventsLoading: true,
        babyId: undefined,
      });
      expect(storesPending).toBe(false);
    });
  });

  describe('web visibility-change — pending alarms drained when tab returns to focus', () => {
    test('shows banner when pending alarm has active nap', () => {
      const { bannersShown } = simulateVisibilityChangeDrain({
        pendingCount: 1,
        activeNapId: 'nap-1',
      });
      expect(bannersShown).toBe(1);
    });

    test('shows no banner when there are no pending alarms', () => {
      const { bannersShown } = simulateVisibilityChangeDrain({
        pendingCount: 0,
        activeNapId: 'nap-1',
      });
      expect(bannersShown).toBe(0);
    });

    test('shows no banner when baby is no longer napping', () => {
      const { bannersShown } = simulateVisibilityChangeDrain({
        pendingCount: 1,
        activeNapId: undefined,
      });
      expect(bannersShown).toBe(0);
    });
  });
});

describe('scheduleAlarmAt threshold', () => {
  test('fires_at > 30s from now → should schedule', () => {
    const firesAt = new Date(Date.now() + 60_000).toISOString();
    expect(shouldScheduleAlarm(firesAt)).toBe(true);
  });

  test('fires_at exactly 30s from now → should schedule', () => {
    const firesAt = new Date(Date.now() + 30_000).toISOString();
    expect(shouldScheduleAlarm(firesAt)).toBe(true);
  });

  test('fires_at < 30s from now → should skip', () => {
    const firesAt = new Date(Date.now() + 10_000).toISOString();
    expect(shouldScheduleAlarm(firesAt)).toBe(false);
  });

  test('fires_at in the past → should skip', () => {
    const firesAt = new Date(Date.now() - 5_000).toISOString();
    expect(shouldScheduleAlarm(firesAt)).toBe(false);
  });
});
