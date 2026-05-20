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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  configure,
  useAuth,
  useEventStore,
  usePreferences,
  setNightBoundaries,
  setSleepThemeAnchors,
  getSleepThemeAnchors,
  getSleepThemeOverride,
  useTheme,
  api,
  i18n,
  useTranslation,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
  findUnsyncedBaby,
  shouldDismissSyncSuggestion,
  getActiveEvent,
  findSyncedNapBaby,
  getAgeWeeks,
  todayLocalDateInputValue,
  isFutureLocalDateInputValue,
} from '@tt/core';
import type { Baby, EventType, LogEventPayload, SyncableEventType, TrackerEvent } from '@tt/core';
import { BabyCard, BabyProfileSheet, LogSheet } from '@tt/ui';
import { BottomTabBar } from '../../components/BottomTabBar';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';
import { SwitchRow } from '../../components/SwitchRow';
import { copyToClipboard } from '../../utils/clipboard';
import styles from './home.module.scss';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';

configure('');

interface BabyEntry {
  name: string;
  birthDate: string;
  weightKg: string;
  heightCm: string;
}

/** Parse a numeric string; return undefined when blank or non-positive. */
function parseNumber(s: string): number | undefined {
  const v = parseFloat(s.replace(',', '.'));
  return isNaN(v) || v <= 0 ? undefined : v;
}
interface SheetState {
  baby: Baby;
  type: EventType;
  suggestedOz?: number;
  suggestedNotes?: string;
}

/** True when every baby with a known birthDate is in Stage 1 (< 15 weeks). */
function isAllStage1(bs: Baby[]): boolean {
  return bs.length > 0 && bs.every(b => b.birthDate != null && getAgeWeeks(b.birthDate) < 15);
}

function formatBabyNames(bs: Baby[]): string {
  if (bs.length === 0) {
    return i18n.t('onboarding.your_baby');
  }
  if (bs.length === 1) {
    return bs[0].name;
  }
  if (bs.length === 2) {
    return `${bs[0].name} and ${bs[1].name}`;
  }
  return (
    bs
      .slice(0, -1)
      .map(b => b.name)
      .join(', ') +
    ', and ' +
    bs[bs.length - 1].name
  );
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
  const { latest, events, logEvent, closeNap } = useEventStore(!authLoading && isAuthenticated);
  const { prefs, setTwinSync, setBedtimeHour, setWakeHour, setSleepTraining } = usePreferences();

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
  const showSkeleton = useDelayedLoading(authLoading || babiesLoading);
  const [entries, setEntries] = useState<BabyEntry[]>([
    { name: '', birthDate: '', weightKg: '', heightCm: '' },
  ]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardError, setOnboardError] = useState('');
  const [showPrefsStep, setShowPrefsStep] = useState(false);
  const [prefsSubStep, setPrefsSubStep] = useState<1 | 2>(1);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showTwinSyncPrompt, setShowTwinSyncPrompt] = useState(false);
  // Single atomic state — eliminates the split-update race that caused 15s render delay
  const [sheet, setSheet] = useState<SheetState | null>(null);
  // Inline confirm for "Wake other baby too?" — avoids browser confirm()
  const [wakeConfirm, setWakeConfirm] = useState<{
    babyName: string;
    otherActive: TrackerEvent;
    endedAt: string;
  } | null>(null);
  // twinSync: babyId of the OTHER baby that was just logged, suggesting sync for remaining babies
  const [syncSuggestion, setSyncSuggestion] = useState<{
    type: SyncableEventType;
    forBabyId: string;
    suggestedOz?: number;
    suggestedNotes?: string;
  } | null>(null);
  const [profileBaby, setProfileBaby] = useState<Baby | null>(null);

  const [logToast, setLogToast] = useState<string | null>(null);
  const logToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browser back button: push a history entry when any modal opens so that pressing
  // back closes the modal instead of navigating away from the page.
  const modalHistoryPushed = useRef(false);
  useEffect(() => {
    const isOpen = sheet !== null || profileBaby !== null;
    if (isOpen && !modalHistoryPushed.current) {
      window.history.pushState({ ttModal: true }, '');
      modalHistoryPushed.current = true;
    } else if (!isOpen) {
      modalHistoryPushed.current = false;
    }
  }, [sheet, profileBaby]);
  useEffect(() => {
    function handlePopState() {
      setSheet(null);
      setProfileBaby(null);
      modalHistoryPushed.current = false;
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const sleepThemeAnchors = useMemo(
    () =>
      getSleepThemeAnchors(
        babies.map(baby => baby.id),
        latest,
      ),
    [babies, latest],
  );
  const sleepThemeOverride = useMemo(
    () =>
      getSleepThemeOverride(
        sleepThemeAnchors.latestSleepStartMs,
        sleepThemeAnchors.latestSleepEndMs,
        new Date(),
        prefs.bedtimeHour,
      ),
    [sleepThemeAnchors, prefs.bedtimeHour],
  );
  const householdNightMode = sleepThemeOverride === 'night';
  useEffect(() => {
    setSleepThemeAnchors(sleepThemeAnchors.latestSleepStartMs, sleepThemeAnchors.latestSleepEndMs);
  }, [sleepThemeAnchors]);

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
    setEntries(prev => [...prev, { name: '', birthDate: '', weightKg: '', heightCm: '' }]);
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
    if (valid.some(en => isFutureLocalDateInputValue(en.birthDate))) {
      setOnboardError(t('onboarding.error_dob_future'));
      return;
    }
    setOnboardError('');
    setOnboardingLoading(true);
    try {
      const created: Baby[] = [];
      for (const en of valid) {
        const baby = await api.babies.create({
          name: en.name.trim(),
          birthDate: en.birthDate,
          weightKg: parseNumber(en.weightKg),
          heightCm: parseNumber(en.heightCm),
        });
        created.push(baby);
      }
      setBabies(created);
      setShowPrefsStep(true);
      setPrefsSubStep(1);
      setSleepTraining(true);
      if (created.length >= 2) {
        setShowTwinSyncPrompt(true);
        // Auto-enable twin sync when babies share the same birth date (i.e. actual twins)
        const dates = created.map(b => b.birthDate).filter(Boolean);
        if (dates.length === created.length && new Set(dates).size === 1) {
          setTwinSync(true);
        }
      }
      setShowInvite(true);
    } catch (err) {
      console.error(err);
    } finally {
      setOnboardingLoading(false);
    }
  }

  // Tap on a baby card action button.
  // If an active nap/sleep event exists → close it (wake up).
  // Otherwise → open the LogSheet for that event type.
  function handleLog(baby: Baby, type: EventType, suggestedOz?: number) {
    if (type === 'nap' || type === 'sleep') {
      const active = getActiveEvent(baby.id, type, latest);
      if (active) {
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
              setWakeConfirm({ babyName: syncedBaby.name, otherActive, endedAt });
            }
          }
        }
        return;
      }
    }
    setSheet({ baby, type, suggestedOz });
  }

  // Called when the LogSheet is submitted.
  // Clears sheet state immediately (optimistic close) then evaluates twin-sync suggestion banners.
  async function handleSheetSubmit(payload: LogEventPayload) {
    const baby = sheet?.baby;
    const suggestedOz = sheet?.suggestedOz;
    setSheet(null);
    try {
      await logEvent(payload);

      if (shouldDismissSyncSuggestion(syncSuggestion, payload)) {
        setSyncSuggestion(null);
      }

      // Confirmation toast
      if (logToastTimer.current) {
        clearTimeout(logToastTimer.current);
      }
      setLogToast(
        i18n.t('common.log_confirmed', { label: i18n.t(`log_sheet.types.${payload.type}`) }),
      );
      logToastTimer.current = setTimeout(() => setLogToast(null), 2000);

      // Twin sync: after logging for one baby, show a one-tap banner for the
      // other baby if their last matching event is stale (nap: any gap,
      // feed: >30 min, diaper: >1h, food: >2h).
      const syncableTypes: SyncableEventType[] = [
        'nap',
        'sleep',
        'bottle',
        'nursing',
        'diaper',
        'food',
      ];
      if (
        prefs.twinSync &&
        baby &&
        babies.length >= 2 &&
        syncableTypes.includes(payload.type as SyncableEventType)
      ) {
        const type = payload.type as SyncableEventType;
        const unsynced = findUnsyncedBaby(type, baby.id, babies, latest);
        if (unsynced) {
          setSyncSuggestion({
            type,
            forBabyId: unsynced.id,
            suggestedOz,
            suggestedNotes: payload.notes ?? undefined,
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Auth has resolved but user is not authenticated — redirect is in flight via useEffect.
  // Return empty page so the home skeleton never flashes on the login page.
  if (!authLoading && !isAuthenticated) {
    return <div className={styles.page} />;
  }

  if (showSkeleton) {
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

  function handleInviteCopy() {
    if (!inviteCode) {
      return;
    }
    const text = t('settings.invite_share_message', { code: inviteCode });
    copyToClipboard(text, () => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }

  return (
    <div className={styles.page}>
      <EmailVerificationBanner />
      {showInvite && inviteCode && !showPrefsStep && babies.length > 0 && (
        <div className={styles.inviteAppBanner} role="banner">
          <div className={styles.inviteAppBannerInfo}>
            <p className={styles.inviteAppBannerLabel}>{t('home.invite_label')}</p>
            <p className={styles.inviteAppBannerCode}>{inviteCode}</p>
          </div>
          <div className={styles.inviteAppBannerActions}>
            <button className={styles.inviteAppBannerCopy} onClick={handleInviteCopy} type="button">
              {inviteCopied ? t('settings.invite_copied') : t('settings.invite_copy')}
            </button>
            <button
              className={styles.inviteAppBannerDismiss}
              onClick={() => setShowInvite(false)}
              type="button"
              aria-label={t('common.dismiss')}
            >
              ×
            </button>
          </div>
        </div>
      )}
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
                    max={todayLocalDateInputValue()}
                    onChange={e => updateEntry(i, 'birthDate', e.target.value)}
                    required
                  />
                  {/* Weight + height fields hidden until metric/imperial toggle is implemented */}
                </div>
              ))}
              <button type="button" className={styles.addAnotherBtn} onClick={addEntry}>
                {t('onboarding.add_another')}
              </button>
              {onboardError && (
                <p style={{ color: 'var(--tt-urgency-overdue)', fontSize: 13, margin: '8px 0 0' }}>
                  {onboardError}
                </p>
              )}
              <button
                type="submit"
                className={styles.submitBtn}
                style={{ marginTop: 24 }}
                disabled={onboardingLoading || !entries.some(en => en.name.trim())}
              >
                {onboardingLoading ? t('onboarding.adding') : t('onboarding.get_started')}
              </button>
            </form>
          </div>
        ) : showPrefsStep ? (
          /* ── Onboarding step 2: schedule + preferences ── */
          prefsSubStep === 1 && !isAllStage1(babies) ? (
            <div>
              <h1 className={styles.onboardHeading}>{t('onboarding.prefs_heading')}</h1>
              <p className={styles.onboardSub}>{t('onboarding.prefs_subtitle')}</p>

              <div className={styles.onboardSection}>
                <p className={styles.onboardSectionTitle}>
                  {t('onboarding.bedtime_question', { names: formatBabyNames(babies) })}
                </p>
                <div className={styles.onboardPillGrid}>
                  {BEDTIME_HOURS.map(h => (
                    <button
                      key={h}
                      className={`${styles.onboardPill} ${prefs.bedtimeHour === h ? styles.onboardPillActive : ''}`}
                      onClick={() => setBedtimeHour(h)}
                      aria-pressed={prefs.bedtimeHour === h}
                      type="button"
                    >
                      {hourLabel(h, prefs.timeFormat)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.onboardSection}>
                <p className={styles.onboardSectionTitle}>
                  {t('onboarding.wake_question', { names: formatBabyNames(babies) })}
                </p>
                <div className={styles.onboardPillGrid}>
                  {WAKE_HOURS.map(h => (
                    <button
                      key={h}
                      className={`${styles.onboardPill} ${prefs.wakeHour === h ? styles.onboardPillActive : ''}`}
                      onClick={() => setWakeHour(h)}
                      aria-pressed={prefs.wakeHour === h}
                      type="button"
                    >
                      {hourLabel(h, prefs.timeFormat)}
                    </button>
                  ))}
                </div>
              </div>

              <button className={styles.submitBtn} onClick={() => setPrefsSubStep(2)} type="button">
                {t('onboarding.step_next')}
              </button>
            </div>
          ) : (
            <div>
              <h1 className={styles.onboardHeading}>{t('onboarding.prefs_heading')}</h1>
              <p className={styles.onboardSub}>{t('onboarding.prefs_step2_sub')}</p>

              <div className={styles.onboardSection}>
                <SwitchRow
                  id="onboardSleepTraining"
                  label={t('settings.sleep_training_title')}
                  hint={t('onboarding.sleep_training_onboard_desc')}
                  checked={prefs.sleepTraining}
                  onChange={setSleepTraining}
                />
              </div>

              {babies.length >= 2 && (
                <div className={styles.onboardSection}>
                  <SwitchRow
                    id="onboardTwinSync"
                    label={t('settings.twin_sync_title')}
                    hint={t('settings.twin_sync_hint')}
                    checked={prefs.twinSync}
                    onChange={v => {
                      setTwinSync(v);
                      setShowTwinSyncPrompt(false);
                    }}
                  />
                </div>
              )}

              <button
                className={styles.submitBtn}
                style={{ marginTop: 24 }}
                onClick={() => setShowPrefsStep(false)}
                type="button"
              >
                {t('onboarding.finished')}
              </button>
            </div>
          )
        ) : (
          <>
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
                      const { otherActive, endedAt } = wakeConfirm;
                      setWakeConfirm(null);
                      closeNap(otherActive, endedAt).catch(console.error);
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
                  sleep: 'home.sync_put_to_sleep',
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
                          const notes = syncSuggestion.suggestedNotes;
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
                              suggestedNotes: notes,
                            });
                          } else {
                            // nap / sleep: no variable input, safe to log directly
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
                  <BabyCard
                    baby={baby}
                    latest={latest}
                    events={events}
                    onLog={(type, oz) => handleLog(baby, type, oz)}
                    onOpenProfile={() => setProfileBaby(baby)}
                    onOpenAnalytics={id => router.push(`/analytics/${id}`)}
                    resetHour={prefs.wakeHour}
                    bedtimeHour={prefs.bedtimeHour}
                    wakeHour={prefs.wakeHour}
                    timeFormat={prefs.timeFormat}
                    sleepTraining={prefs.sleepTraining}
                    householdNightMode={householdNightMode}
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
        suggestedNotes={sheet?.suggestedNotes}
        defaultVolumeUnit={prefs.units === 'metric' ? 'ml' : 'oz'}
        suggestedBreast={
          sheet?.baby
            ? latest[`${sheet.baby.id}:nursing`]?.notes === 'left'
              ? 'right'
              : 'left'
            : 'left'
        }
        timeFormat={prefs.timeFormat}
        onSubmit={handleSheetSubmit}
        onClose={() => setSheet(null)}
      />

      <BabyProfileSheet
        visible={profileBaby !== null}
        baby={profileBaby}
        units={prefs.units}
        onSave={async (id, data) => {
          await api.babies.update(id, {
            name: data.name,
            birthDate: data.birthDate ?? null,
            adjustedBirthDate: data.adjustedBirthDate,
            sex: data.sex,
            weightKg: data.weightKg,
            heightCm: data.heightCm,
          });
          const updated = await api.babies.list();
          setBabies(updated);
        }}
        onClose={() => setProfileBaby(null)}
      />

      {logToast && <div className={styles.logToast}>{logToast}</div>}

      <BottomTabBar />
    </div>
  );
}
