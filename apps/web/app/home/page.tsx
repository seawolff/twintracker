'use client';
/**
 * home/page.tsx — Web home screen (Next.js App Router, client component)
 *
 * Rendering flow:
 *   babies.length === 0           → Onboarding step 1: add baby name(s) + DOB
 *   showPrefsStep === true        → Onboarding step 2: bedtime / wake / sleep training
 *   otherwise                    → Main home: baby cards, banners, log sheet
 *
 * Key state:
 *   sheet          — which baby + event type the LogSheet is open for (null = closed)
 *   napBanners     — per-baby "Still sleeping?" banners shown when a nap-check alarm fires
 *   syncSuggestion — twin-sync one-tap banner for the other baby after a log
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  configure,
  useAuth,
  useEventStore,
  usePreferences,
  useAlarms,
  setNightBoundaries,
  setSleepActive,
  useTheme,
  api,
  useTranslation,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
  findUnsyncedBaby,
  getActiveEvent,
  findSyncedNapBaby,
  getDiaperReminderIntervalMs,
  getFeedReminderIntervalMs,
  formatReminderInterval,
  isNightFireTime,
} from '@tt/core';
import type { Baby, EventType, LogEventPayload, SyncableEventType, TrackerEvent } from '@tt/core';
import { BabyCard, LogSheet } from '@tt/ui';
import { BottomTabBar } from '../../components/BottomTabBar';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';
import styles from './home.module.scss';

configure('');

interface BabyEntry {
  name: string;
  birthDate: string;
}
interface SheetState {
  baby: Baby;
  type: EventType;
  suggestedOz?: number;
}

export default function HomePage() {
  const router = useRouter();
  const {
    isAuthenticated,
    loading: authLoading,
    inviteCode,
    emailVerified,
    resendVerification,
    refreshEmailVerified,
    user,
  } = useAuth();
  const [verifyResendLoading, setVerifyResendLoading] = useState(false);
  const [verifyResendSent, setVerifyResendSent] = useState(false);
  const { latest, events, logEvent, closeNap, deleteEvent } = useEventStore(
    !authLoading && isAuthenticated,
  );
  const {
    prefs,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setDiaperNotifications,
    setBottleNotifications,
  } = usePreferences();
  const { alarms, createAlarm, dismissAlarm, rescheduleAlarm, getAlarmForBaby } = useAlarms();

  // Sync bedtime/wake settings into the theme engine so night mode transitions correctly
  useEffect(() => {
    setNightBoundaries(prefs.wakeHour, prefs.bedtimeHour);
  }, [prefs.wakeHour, prefs.bedtimeHour]);

  // Bridge the React theme token to the CSS custom-property system.
  // Updates [data-theme] on <html> whenever the mode changes, which triggers
  // the global CSS var overrides in globals.scss with a smooth transition.
  const theme = useTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme.mode;
  }, [theme.mode]);

  const { t } = useTranslation();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [babiesLoading, setBabiesLoading] = useState(true);
  const [entries, setEntries] = useState<BabyEntry[]>([{ name: '', birthDate: '' }]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [showPrefsStep, setShowPrefsStep] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showTwinSyncPrompt, setShowTwinSyncPrompt] = useState(false);
  // Single atomic state — eliminates the split-update race that caused 15s render delay
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [napBanners, setNapBanners] = useState<Record<string, { babyName: string; napId: string }>>(
    {},
  );
  // Inline confirm for "Wake other baby too?" — avoids browser confirm()
  const [wakeConfirm, setWakeConfirm] = useState<{
    babyName: string;
    otherActive: TrackerEvent;
    otherAlarmId?: string;
    endedAt: string;
  } | null>(null);
  // twinSync: babyId of the OTHER baby that was just logged, suggesting sync for remaining babies
  const [syncSuggestion, setSyncSuggestion] = useState<{
    type: 'nap' | 'bottle' | 'nursing' | 'diaper' | 'food';
    forBabyId: string;
    suggestedOz?: number;
  } | null>(null);
  // maps alarmId → web setTimeout id (for cancellation on dismiss/wake)
  const alarmTimers = useRef<Map<string, number>>(new Map());
  // Snapshot of latest state for use inside alarm setTimeout closures
  const latestStateRef = useRef({ babies, latest, twinSync: prefs.twinSync });
  useEffect(() => {
    latestStateRef.current = { babies, latest, twinSync: prefs.twinSync };
  }, [babies, latest, prefs.twinSync]);
  // Alarm checks that fired while the tab was hidden — processed when tab becomes visible.
  const pendingAlarmChecks = useRef<Map<string, { babyName: string }>>(new Map());
  // maps babyId → web setTimeout id for diaper reminders
  const diaperTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // maps babyId → web setTimeout id for feed reminders
  const bottleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Flip to night mode while any baby has an active sleep (night) event.
  // Naps do not trigger night mode.
  useEffect(() => {
    const anySleepActive = babies.some(baby => getActiveEvent(baby.id, 'sleep', latest) != null);
    setSleepActive(anySleepActive);
  }, [babies, latest]);

  // Cancel web timeouts for alarms dismissed on another device
  useEffect(() => {
    alarmTimers.current.forEach((timerId, alarmId) => {
      if (!alarms.find(a => a.id === alarmId)) {
        clearTimeout(timerId);
        alarmTimers.current.delete(alarmId);
      }
    });
  }, [alarms]);

  // When the tab returns to focus, show in-app "Still sleeping?" banners for any alarms
  // that fired while the tab was hidden (background notification already sent as a nudge).
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (pendingAlarmChecks.current.size === 0) {
        return;
      }
      const {
        babies: curBabies,
        latest: curLatest,
        twinSync: curTwinSync,
      } = latestStateRef.current;
      const newBanners: Record<string, { babyName: string; napId: string }> = {};
      pendingAlarmChecks.current.forEach(({ babyName }, babyId) => {
        const activeNap =
          getActiveEvent(babyId, 'nap', curLatest) ?? getActiveEvent(babyId, 'sleep', curLatest);
        if (!activeNap) {
          return;
        }
        newBanners[babyId] = { babyName, napId: activeNap.id };
        if (curTwinSync) {
          const otherBaby = curBabies.find(b => b.id !== babyId);
          if (otherBaby) {
            const otherNap =
              getActiveEvent(otherBaby.id, 'nap', curLatest) ??
              getActiveEvent(otherBaby.id, 'sleep', curLatest);
            if (otherNap) {
              newBanners[otherBaby.id] = { babyName: otherBaby.name, napId: otherNap.id };
            }
          }
        }
      });
      pendingAlarmChecks.current.clear();
      if (Object.keys(newBanners).length > 0) {
        setNapBanners(prev => ({ ...prev, ...newBanners }));
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Re-check email verification when the tab regains focus — handles the case where the user
  // verified in another tab and switched back without navigating.
  useEffect(() => {
    if (emailVerified !== false) {
      return;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshEmailVerified();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [emailVerified, refreshEmailVerified]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    api.babies
      .list()
      .then(b => {
        setBabies(b);
      })
      .catch(console.error)
      .finally(() => setBabiesLoading(false));
  }, [authLoading, isAuthenticated]);

  function updateEntry(i: number, field: keyof BabyEntry, val: string) {
    setEntries(prev => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));
  }

  function addEntry() {
    setEntries(prev => [...prev, { name: '', birthDate: '' }]);
  }

  function removeEntry(i: number) {
    setEntries(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleAddBabies(e: React.FormEvent) {
    e.preventDefault();
    const valid = entries.filter(en => en.name.trim());
    if (!valid.length) {
      return;
    }
    setOnboardingLoading(true);
    try {
      const created: Baby[] = [];
      for (const en of valid) {
        const baby = await api.babies.create({
          name: en.name.trim(),
          birthDate: en.birthDate || undefined,
        });
        created.push(baby);
      }
      setBabies(created);
      setShowPrefsStep(true);
      if (created.length >= 2) {
        setShowTwinSyncPrompt(true);
      }
      setShowInvite(true);
    } catch (err) {
      console.error(err);
    } finally {
      setOnboardingLoading(false);
    }
  }

  // Tap on a baby card action button.
  // If an active nap/sleep event exists → close it (wake up) + dismiss any active alarm.
  // Otherwise → open the LogSheet for that event type.
  function handleLog(baby: Baby, type: EventType, suggestedOz?: number) {
    if (type === 'nap' || type === 'sleep') {
      const active = getActiveEvent(baby.id, type, latest);
      if (active) {
        const existingAlarm = getAlarmForBaby(baby.id);
        if (existingAlarm) {
          dismissAlarm(existingAlarm.id).catch(console.error);
          const timerId = alarmTimers.current.get(existingAlarm.id);
          if (timerId !== undefined) {
            clearTimeout(timerId);
            alarmTimers.current.delete(existingAlarm.id);
          }
        }
        const endedAt = new Date().toISOString();
        closeNap(active, endedAt).catch(console.error);
        // If twinSync is on, check whether the other baby has a synced nap/sleep
        if (prefs.twinSync && babies.length >= 2) {
          const syncedBaby = findSyncedNapBaby(baby.id, active, babies, latest);
          if (syncedBaby) {
            const otherActive =
              getActiveEvent(syncedBaby.id, 'nap', latest) ??
              getActiveEvent(syncedBaby.id, 'sleep', latest);
            if (otherActive) {
              const otherAlarm = getAlarmForBaby(syncedBaby.id);
              setWakeConfirm({
                babyName: syncedBaby.name,
                otherActive,
                otherAlarmId: otherAlarm?.id,
                endedAt,
              });
            }
          }
        }
        return;
      }
    }
    setSheet({ baby, type, suggestedOz });
  }

  // Creates a server-side alarm and schedules a web browser notification for it.
  async function handleSetAlarm(baby: Baby, durationMs: number, isCustomTimer: boolean) {
    // Request permission NOW — we're still in the user gesture context (button tap).
    // Browsers block permission prompts that fire after async awaits.
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    const minutes = Math.round(durationMs / 60_000);
    const label = isCustomTimer
      ? `Your ${minutes} min timer is up.`
      : `Your ${minutes} min timer is up. Do you need to check on ${baby.name}?`;
    const firesAt = new Date(Date.now() + durationMs).toISOString();
    try {
      const alarm = await createAlarm(baby.id, firesAt, durationMs, label);
      const delayMs = new Date(firesAt).getTime() - Date.now();
      if (delayMs > 0) {
        const alarmId = alarm.id;
        const babyId = baby.id;
        const babyName = baby.name;
        const timerId = window.setTimeout(() => {
          alarmTimers.current.delete(alarmId);
          dismissAlarm(alarmId).catch(console.error);
          if (isCustomTimer) {
            return;
          }
          if (document.visibilityState === 'visible') {
            // App is foregrounded — show in-app "Still sleeping?" banner(s)
            const {
              babies: curBabies,
              latest: curLatest,
              twinSync: curTwinSync,
            } = latestStateRef.current;
            const activeNap =
              getActiveEvent(babyId, 'nap', curLatest) ??
              getActiveEvent(babyId, 'sleep', curLatest);
            if (!activeNap) {
              return;
            }
            setNapBanners(prev => {
              const next = { ...prev, [babyId]: { babyName, napId: activeNap.id } };
              if (curTwinSync) {
                const otherBaby = curBabies.find(b => b.id !== babyId);
                if (otherBaby) {
                  const otherNap =
                    getActiveEvent(otherBaby.id, 'nap', curLatest) ??
                    getActiveEvent(otherBaby.id, 'sleep', curLatest);
                  if (otherNap) {
                    next[otherBaby.id] = { babyName: otherBaby.name, napId: otherNap.id };
                  }
                }
              }
              return next;
            });
          } else {
            // App is backgrounded — store for in-app banner when tab returns to focus,
            // and send a browser notification to nudge the user back.
            pendingAlarmChecks.current.set(babyId, { babyName });
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('TwinTracker', {
                body: `Is ${babyName} still asleep?`,
                icon: '/icon-192.png',
              });
            }
          }
        }, delayMs);
        alarmTimers.current.set(alarmId, timerId);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Called when the LogSheet is submitted.
  // Clears sheet state immediately (optimistic close) then evaluates twin-sync suggestion banners.
  async function handleSheetSubmit(payload: LogEventPayload) {
    // Request notification permission while still in user gesture context — must be before any awaits.
    if (
      'Notification' in window &&
      Notification.permission === 'default' &&
      (prefs.diaperNotifications || prefs.bottleNotifications)
    ) {
      await Notification.requestPermission();
    }
    const baby = sheet?.baby;
    const suggestedOz = sheet?.suggestedOz;
    setSheet(null);
    try {
      await logEvent(payload);

      // Diaper reminder: cancel previous timer for this baby, schedule age-adaptive interval out.
      // Skip if the fire time would land during the night window (bedtime→wake).
      if (
        payload.type === 'diaper' &&
        baby &&
        prefs.diaperNotifications &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const prevId = diaperTimers.current.get(baby.id);
        if (prevId !== undefined) {
          clearTimeout(prevId);
        }
        const intervalMs = getDiaperReminderIntervalMs(baby.birthDate);
        if (!isNightFireTime(Date.now() + intervalMs, prefs.bedtimeHour, prefs.wakeHour)) {
          const body = `It's been about ${formatReminderInterval(intervalMs)}. Time to change ${baby.name}?`;
          diaperTimers.current.set(
            baby.id,
            setTimeout(() => {
              diaperTimers.current.delete(baby.id);
              new Notification('TwinTracker', { body, icon: '/icon-192.png' });
            }, intervalMs),
          );
        }
      }

      // Feed reminder: cancel previous timer for this baby, schedule age-adaptive interval out.
      // Skip if the fire time would land during the night window (bedtime→wake).
      if (
        (payload.type === 'bottle' || payload.type === 'nursing') &&
        baby &&
        prefs.bottleNotifications &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const prevId = bottleTimers.current.get(baby.id);
        if (prevId !== undefined) {
          clearTimeout(prevId);
        }
        const intervalMs = getFeedReminderIntervalMs(baby.birthDate);
        if (!isNightFireTime(Date.now() + intervalMs, prefs.bedtimeHour, prefs.wakeHour)) {
          const body = `It's been about ${formatReminderInterval(intervalMs)}. Time to feed ${baby.name}?`;
          bottleTimers.current.set(
            baby.id,
            setTimeout(() => {
              bottleTimers.current.delete(baby.id);
              new Notification('TwinTracker', { body, icon: '/icon-192.png' });
            }, intervalMs),
          );
        }
      }

      // Twin sync: after logging for one baby, show a one-tap banner for the
      // other baby if their last matching event is stale (nap: any gap,
      // feed: >30 min, diaper: >1h, food: >2h).
      const syncableTypes: SyncableEventType[] = ['nap', 'bottle', 'nursing', 'diaper', 'food'];
      if (
        prefs.twinSync &&
        baby &&
        babies.length >= 2 &&
        syncableTypes.includes(payload.type as SyncableEventType)
      ) {
        const type = payload.type as SyncableEventType;
        const unsynced = findUnsyncedBaby(type, baby.id, babies, latest);
        if (unsynced) {
          setSyncSuggestion({ type, forBabyId: unsynced.id, suggestedOz });
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // User confirmed the baby IS still asleep — dismiss the nap-check banner.
  function handleNapStillSleeping(babyId: string) {
    setNapBanners(prev => {
      const n = { ...prev };
      delete n[babyId];
      return n;
    });
  }

  // User confirmed the baby never fell asleep — dismiss banner and delete the nap event.
  function handleNapNotAsleep(babyId: string) {
    const banner = napBanners[babyId];
    if (!banner) {
      return;
    }
    setNapBanners(prev => {
      const n = { ...prev };
      delete n[babyId];
      return n;
    });
    deleteEvent(banner.napId).catch(console.error);
  }

  if (authLoading || babiesLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.scroll}>
          <div className={styles.babyList}>
            {[0, 1].map(i => (
              <div key={i} className={styles.skeletonCard}>
                <div className={styles.skeletonLine} style={{ height: 18, width: '45%' }} />
                <div className={styles.skeletonLine} style={{ height: 13, width: '30%' }} />
                <div className={styles.skeletonActions}>
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className={styles.skeletonBtn} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <BottomTabBar />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <EmailVerificationBanner />
      <div className={styles.scroll}>
        {emailVerified === false ? (
          /* ── Email gate: must verify before using the app ── */
          <div>
            <h1 className={styles.onboardHeading}>{t('auth.check_email_heading')}</h1>
            <p className={styles.onboardSub}>
              {t('auth.check_email_body', { email: user?.email ?? '' })}
            </p>
            <button
              className={styles.submitBtn}
              onClick={async () => {
                setVerifyResendLoading(true);
                try {
                  await resendVerification();
                  setVerifyResendSent(true);
                  setTimeout(() => setVerifyResendSent(false), 4000);
                } catch {
                  /* silent */
                } finally {
                  setVerifyResendLoading(false);
                }
              }}
              disabled={verifyResendLoading || verifyResendSent}
              type="button"
            >
              {verifyResendSent
                ? t('auth.check_email_resent')
                : verifyResendLoading
                  ? '…'
                  : t('auth.check_email_resend')}
            </button>
          </div>
        ) : babies.length === 0 ? (
          /* ── Onboarding step 1: add babies ── */
          <div>
            <h1 className={styles.onboardHeading}>{t('onboarding.welcome')}</h1>
            <p className={styles.onboardSub}>{t('onboarding.subtitle')}</p>
            <form onSubmit={handleAddBabies}>
              {entries.map((en, i) => (
                <div key={i} className={styles.babyEntry}>
                  <div className={styles.babyEntryHeader}>
                    <span className={styles.entryLabel}>
                      {t('onboarding.baby_n', { n: i + 1 })}
                    </span>
                    {entries.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => removeEntry(i)}
                        aria-label={t('onboarding.baby_n', { n: i + 1 })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder={t('onboarding.name_placeholder')}
                    value={en.name}
                    onChange={e => updateEntry(i, 'name', e.target.value)}
                    required={i === 0}
                  />
                  <label className={styles.label}>{t('onboarding.dob_label')}</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={en.birthDate}
                    onChange={e => updateEntry(i, 'birthDate', e.target.value)}
                  />
                </div>
              ))}
              <button type="button" className={styles.addAnotherBtn} onClick={addEntry}>
                {t('onboarding.add_another')}
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={onboardingLoading || !entries.some(en => en.name.trim())}
              >
                {onboardingLoading ? t('onboarding.adding') : t('onboarding.get_started')}
              </button>
            </form>
          </div>
        ) : showPrefsStep ? (
          /* ── Onboarding step 2: schedule setup ── */
          <div>
            <h1 className={styles.onboardHeading}>{t('onboarding.prefs_heading')}</h1>
            <p className={styles.onboardSub}>{t('onboarding.prefs_subtitle')}</p>

            <div className={styles.onboardSection}>
              <p className={styles.onboardSectionTitle}>{t('settings.bedtime_title')}</p>
              <p className={styles.onboardSectionHint}>{t('settings.bedtime_hint')}</p>
              <div className={styles.onboardPillGrid}>
                {BEDTIME_HOURS.map(h => (
                  <button
                    key={h}
                    className={`${styles.onboardPill} ${prefs.bedtimeHour === h ? styles.onboardPillActive : ''}`}
                    onClick={() => setBedtimeHour(h)}
                    aria-pressed={prefs.bedtimeHour === h}
                    type="button"
                  >
                    {hourLabel(h)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.onboardSection}>
              <p className={styles.onboardSectionTitle}>{t('settings.wake_title')}</p>
              <p className={styles.onboardSectionHint}>{t('settings.wake_hint')}</p>
              <div className={styles.onboardPillGrid}>
                {WAKE_HOURS.map(h => (
                  <button
                    key={h}
                    className={`${styles.onboardPill} ${prefs.wakeHour === h ? styles.onboardPillActive : ''}`}
                    onClick={() => setWakeHour(h)}
                    aria-pressed={prefs.wakeHour === h}
                    type="button"
                  >
                    {hourLabel(h)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.onboardSection}>
              <p className={styles.onboardSectionTitle}>{t('settings.sleep_training_title')}</p>
              <p className={styles.onboardSectionHint}>{t('settings.sleep_training_hint')}</p>
              <button
                className={`${styles.onboardPill} ${styles.onboardPillFull} ${prefs.sleepTraining ? styles.onboardPillActive : ''}`}
                onClick={() => setSleepTraining(!prefs.sleepTraining)}
                aria-pressed={prefs.sleepTraining}
                type="button"
              >
                {prefs.sleepTraining
                  ? t('settings.sleep_training_enabled')
                  : t('settings.sleep_training_enable')}
              </button>
            </div>

            <div className={styles.onboardSection}>
              <p className={styles.onboardSectionTitle}>
                {t('settings.diaper_notifications_title')}
              </p>
              <p className={styles.onboardSectionHint}>{t('settings.diaper_notifications_hint')}</p>
              <button
                className={`${styles.onboardPill} ${styles.onboardPillFull} ${prefs.diaperNotifications ? styles.onboardPillActive : ''}`}
                onClick={() => setDiaperNotifications(!prefs.diaperNotifications)}
                aria-pressed={prefs.diaperNotifications}
                type="button"
              >
                {prefs.diaperNotifications
                  ? t('settings.diaper_notifications_enabled')
                  : t('settings.diaper_notifications_enable')}
              </button>
            </div>

            <div className={styles.onboardSection}>
              <p className={styles.onboardSectionTitle}>
                {t('settings.bottle_notifications_title')}
              </p>
              <p className={styles.onboardSectionHint}>{t('settings.bottle_notifications_hint')}</p>
              <button
                className={`${styles.onboardPill} ${styles.onboardPillFull} ${prefs.bottleNotifications ? styles.onboardPillActive : ''}`}
                onClick={() => setBottleNotifications(!prefs.bottleNotifications)}
                aria-pressed={prefs.bottleNotifications}
                type="button"
              >
                {prefs.bottleNotifications
                  ? t('settings.bottle_notifications_enabled')
                  : t('settings.bottle_notifications_enable')}
              </button>
            </div>

            <button
              className={styles.submitBtn}
              onClick={() => setShowPrefsStep(false)}
              type="button"
            >
              {t('onboarding.done')}
            </button>
          </div>
        ) : (
          <>
            {/* Invite code banner */}
            {showInvite && inviteCode && (
              <div className={styles.inviteBanner}>
                <p className={styles.inviteLabel}>{t('home.invite_label')}</p>
                <p className={styles.inviteCode}>{inviteCode}</p>
                <p className={styles.inviteHint}>{t('home.invite_hint')}</p>
                <button className={styles.dismissBtn} onClick={() => setShowInvite(false)}>
                  {t('common.dismiss')}
                </button>
              </div>
            )}

            {/* Twin sync onboarding prompt (shown once after 2nd baby is created) */}
            {showTwinSyncPrompt && (
              <div className={styles.syncBanner}>
                <span className={styles.syncBannerText}>{t('home.twin_sync_prompt')}</span>
                <div className={styles.napBannerActions}>
                  <button
                    className={styles.napBannerBtn}
                    onClick={() => {
                      setTwinSync(true);
                      setShowTwinSyncPrompt(false);
                    }}
                  >
                    {t('home.twin_sync_enable')}
                  </button>
                  <button
                    className={`${styles.napBannerBtn} ${styles.napBannerBtnCancel}`}
                    onClick={() => setShowTwinSyncPrompt(false)}
                  >
                    {t('common.skip')}
                  </button>
                </div>
              </div>
            )}

            {/* Wake other baby confirmation banner */}
            {wakeConfirm && (
              <div className={styles.syncBanner}>
                <span className={styles.syncBannerText}>{`Wake ${wakeConfirm.babyName} too?`}</span>
                <div className={styles.napBannerActions}>
                  <button
                    className={styles.napBannerBtn}
                    onClick={() => {
                      const { otherActive, otherAlarmId, endedAt } = wakeConfirm;
                      setWakeConfirm(null);
                      closeNap(otherActive, endedAt).catch(console.error);
                      if (otherAlarmId) {
                        dismissAlarm(otherAlarmId).catch(console.error);
                        const timerId = alarmTimers.current.get(otherAlarmId);
                        if (timerId !== undefined) {
                          clearTimeout(timerId);
                          alarmTimers.current.delete(otherAlarmId);
                        }
                      }
                    }}
                  >
                    {t('common.yes')}
                  </button>
                  <button
                    className={`${styles.napBannerBtn} ${styles.napBannerBtnCancel}`}
                    onClick={() => setWakeConfirm(null)}
                  >
                    {t('common.no')}
                  </button>
                </div>
              </div>
            )}

            {/* Twin sync suggestion banner */}
            {syncSuggestion &&
              (() => {
                const syncBaby = babies.find(b => b.id === syncSuggestion.forBabyId);
                if (!syncBaby) {
                  return null;
                }
                const SYNC_KEY: Record<string, string> = {
                  nap: 'home.sync_put_down',
                  bottle: 'home.sync_feed',
                  nursing: 'home.sync_feed',
                  diaper: 'home.sync_diaper',
                  food: 'home.sync_food',
                };
                const label = t(SYNC_KEY[syncSuggestion.type] ?? 'home.sync_feed', {
                  name: syncBaby.name,
                });
                return (
                  <div className={styles.syncBanner}>
                    <span className={styles.syncBannerText}>{label}</span>
                    <div className={styles.napBannerActions}>
                      <button
                        className={styles.napBannerBtn}
                        onClick={() => {
                          const type = syncSuggestion.type;
                          const oz = syncSuggestion.suggestedOz;
                          setSyncSuggestion(null);
                          if (
                            type === 'bottle' ||
                            type === 'nursing' ||
                            type === 'diaper' ||
                            type === 'food'
                          ) {
                            // Open LogSheet for the twin so the user can confirm/adjust
                            // the amount, type, or notes — never auto-log with a guessed value.
                            setSheet({
                              baby: syncBaby,
                              type,
                              suggestedOz: type === 'bottle' ? oz : undefined,
                            });
                          } else {
                            // nap: no variable input, safe to log directly
                            logEvent({
                              babyId: syncBaby.id,
                              type,
                              startedAt: new Date().toISOString(),
                            }).catch(console.error);
                          }
                        }}
                      >
                        {t('common.yes')}
                      </button>
                      <button
                        className={`${styles.napBannerBtn} ${styles.napBannerBtnCancel}`}
                        onClick={() => setSyncSuggestion(null)}
                      >
                        {t('common.skip')}
                      </button>
                    </div>
                  </div>
                );
              })()}

            <div className={styles.babyList}>
              {babies.map(baby => (
                <div key={baby.id} className={styles.babySlot}>
                  {napBanners[baby.id] && (
                    <div className={styles.napBanner}>
                      <span className={styles.napBannerText}>
                        {t('home.nap_banner_still_sleeping')}
                      </span>
                      <div className={styles.napBannerActions}>
                        <button
                          className={styles.napBannerBtn}
                          onClick={() => handleNapStillSleeping(baby.id)}
                        >
                          {t('home.nap_banner_yes')}
                        </button>
                        <button
                          className={`${styles.napBannerBtn} ${styles.napBannerBtnCancel}`}
                          onClick={() => handleNapNotAsleep(baby.id)}
                        >
                          {t('home.nap_banner_cancel_nap')}
                        </button>
                      </div>
                    </div>
                  )}
                  <BabyCard
                    baby={baby}
                    latest={latest}
                    events={events}
                    onLog={(type, oz) => handleLog(baby, type, oz)}
                    onOpenAnalytics={id => router.push(`/analytics/${id}`)}
                    resetHour={prefs.wakeHour}
                    bedtimeHour={prefs.bedtimeHour}
                    wakeHour={prefs.wakeHour}
                    sleepTraining={prefs.sleepTraining}
                    napCheckMinutes={prefs.napCheckMinutes}
                    activeAlarm={getAlarmForBaby(baby.id)}
                    onSetAlarm={(durationMs, isCustomTimer) =>
                      handleSetAlarm(baby, durationMs, isCustomTimer)
                    }
                    onDismissAlarm={() => {
                      const alarm = getAlarmForBaby(baby.id);
                      if (alarm) {
                        dismissAlarm(alarm.id).catch(console.error);
                        const timerId = alarmTimers.current.get(alarm.id);
                        if (timerId !== undefined) {
                          clearTimeout(timerId);
                          alarmTimers.current.delete(alarm.id);
                        }
                      }
                    }}
                    onRescheduleAlarm={(firesAt, durationMs) => {
                      const alarm = getAlarmForBaby(baby.id);
                      if (alarm) {
                        rescheduleAlarm(alarm.id, firesAt, durationMs).catch(console.error);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <LogSheet
        visible={sheet !== null}
        baby={sheet?.baby ?? null}
        eventType={sheet?.type ?? null}
        suggestedOz={sheet?.suggestedOz}
        onSubmit={handleSheetSubmit}
        onClose={() => setSheet(null)}
      />

      <BottomTabBar />
    </div>
  );
}
