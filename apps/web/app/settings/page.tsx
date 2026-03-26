'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  usePreferences,
  useAuth,
  useEventStore,
  api,
  generateMockEvents,
  useTranslation,
  NAP_CHECK_MINUTES,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
} from '@tt/core';
import type { Baby, LogEventPayload, TrackerEvent } from '@tt/core';
import { BottomTabBar } from '../../components/BottomTabBar';
import styles from './settings.module.scss';

export default function SettingsPage() {
  const router = useRouter();
  const {
    prefs,
    setNapCheckMinutes,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setDiaperNotifications,
    setBottleNotifications,
  } = usePreferences();
  const {
    isAdmin,
    inviteCode,
    logout,
    isAuthenticated,
    loading: authLoading,
    displayName,
    updateDisplayName,
  } = useAuth();
  const { clearAllEvents } = useEventStore(!authLoading && isAuthenticated);
  const { t } = useTranslation();
  const [nameInput, setNameInput] = useState('');
  const nameInitialized = useRef(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Seed the input once when displayName first resolves from null (async storage init)
  useEffect(() => {
    if (!nameInitialized.current && displayName !== null) {
      nameInitialized.current = true;
      setNameInput(displayName);
    }
  }, [displayName]);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [mockMode, setMockMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('tt_mock_mode') === 'true',
  );
  const [generating, setGenerating] = useState(false);
  const [mockProgress, setMockProgress] = useState<{ done: number; total: number } | null>(null);
  const [mockError, setMockError] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    api.babies.list().then(setBabies).catch(console.error);
  }, [authLoading, isAuthenticated]);

  function handleCopy() {
    if (!inviteCode) {
      return;
    }
    const text = t('settings.invite_share_message', { code: inviteCode });
    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(confirm);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      confirm();
    }
  }

  async function handleToggleMockData() {
    setGenerating(true);
    setMockProgress(null);
    try {
      if (!mockMode) {
        // Snapshot real events
        const real: TrackerEvent[] = await api.events.list();
        const snapshot: LogEventPayload[] = real.map(e => ({
          babyId: e.babyId,
          type: e.type,
          startedAt: e.startedAt,
          endedAt: e.endedAt ?? undefined,
          value: e.value ?? undefined,
          unit: e.unit ?? undefined,
          notes: e.notes ?? undefined,
        }));
        localStorage.setItem('tt_real_events_snapshot', JSON.stringify(snapshot));

        await clearAllEvents();

        const payloads = generateMockEvents(babies);
        setMockProgress({ done: 0, total: payloads.length });
        for (let i = 0; i < payloads.length; i++) {
          await api.events.create(payloads[i]);
          setMockProgress({ done: i + 1, total: payloads.length });
        }
        localStorage.setItem('tt_mock_mode', 'true');
        setMockMode(true);
      } else {
        await clearAllEvents();

        const raw = localStorage.getItem('tt_real_events_snapshot');
        if (raw) {
          const snapshot: LogEventPayload[] = JSON.parse(raw);
          setMockProgress({ done: 0, total: snapshot.length });
          for (let i = 0; i < snapshot.length; i++) {
            await api.events.create(snapshot[i]);
            setMockProgress({ done: i + 1, total: snapshot.length });
          }
          localStorage.removeItem('tt_real_events_snapshot');
        }
        localStorage.setItem('tt_mock_mode', 'false');
        setMockMode(false);
      }
      router.push('/home');
    } catch (e) {
      console.error(e);
      setMockError('Failed to toggle mock data');
    } finally {
      setGenerating(false);
      setMockProgress(null);
    }
  }

  async function handleClearConfirmed() {
    setClearConfirm(false);
    setClearing(true);
    try {
      await clearAllEvents();
      router.push('/home');
    } catch (e) {
      setClearError('Failed to clear logs');
      setClearing(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <h1 className={styles.heading}>{t('settings.heading')}</h1>

        {!prefs.sleepTraining && (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t('settings.nap_check_title')}</p>
            <p className={styles.sectionHint}>{t('settings.nap_check_hint')}</p>
            <div className={styles.pillGrid}>
              {NAP_CHECK_MINUTES.map(m => (
                <button
                  key={m}
                  className={`${styles.pill} ${prefs.napCheckMinutes === m ? styles.pillActive : ''}`}
                  onClick={() => setNapCheckMinutes(m)}
                  aria-pressed={prefs.napCheckMinutes === m}
                >
                  {t('settings.nap_check_minutes', { n: m })}
                </button>
              ))}
            </div>
          </section>
        )}

        {babies.length >= 2 && (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t('settings.twin_sync_title')}</p>
            <p className={styles.sectionHint}>{t('settings.twin_sync_hint')}</p>
            <button
              className={`${styles.pill} ${styles.pillFull} ${prefs.twinSync ? styles.pillActive : ''}`}
              onClick={() => setTwinSync(!prefs.twinSync)}
              aria-pressed={prefs.twinSync}
            >
              {prefs.twinSync ? t('settings.twin_sync_enabled') : t('settings.twin_sync_enable')}
            </button>
          </section>
        )}

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.diaper_notifications_title')}</p>
          <p className={styles.sectionHint}>{t('settings.diaper_notifications_hint')}</p>
          <button
            className={`${styles.pill} ${styles.pillFull} ${prefs.diaperNotifications ? styles.pillActive : ''}`}
            onClick={() => setDiaperNotifications(!prefs.diaperNotifications)}
            aria-pressed={prefs.diaperNotifications}
          >
            {prefs.diaperNotifications
              ? t('settings.diaper_notifications_enabled')
              : t('settings.diaper_notifications_enable')}
          </button>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.bottle_notifications_title')}</p>
          <p className={styles.sectionHint}>{t('settings.bottle_notifications_hint')}</p>
          <button
            className={`${styles.pill} ${styles.pillFull} ${prefs.bottleNotifications ? styles.pillActive : ''}`}
            onClick={() => setBottleNotifications(!prefs.bottleNotifications)}
            aria-pressed={prefs.bottleNotifications}
          >
            {prefs.bottleNotifications
              ? t('settings.bottle_notifications_enabled')
              : t('settings.bottle_notifications_enable')}
          </button>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.sleep_training_title')}</p>
          <p className={styles.sectionHint}>{t('settings.sleep_training_hint')}</p>
          <button
            className={`${styles.pill} ${styles.pillFull} ${prefs.sleepTraining ? styles.pillActive : ''}`}
            onClick={() => setSleepTraining(!prefs.sleepTraining)}
            aria-pressed={prefs.sleepTraining}
          >
            {prefs.sleepTraining
              ? t('settings.sleep_training_enabled')
              : t('settings.sleep_training_enable')}
          </button>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.wake_title')}</p>
          <p className={styles.sectionHint}>{t('settings.wake_hint')}</p>
          <div className={styles.pillGrid}>
            {WAKE_HOURS.map(h => (
              <button
                key={h}
                className={`${styles.pill} ${prefs.wakeHour === h ? styles.pillActive : ''}`}
                onClick={() => setWakeHour(h)}
                aria-pressed={prefs.wakeHour === h}
              >
                {hourLabel(h)}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.bedtime_title')}</p>
          <p className={styles.sectionHint}>{t('settings.bedtime_hint')}</p>
          <div className={styles.pillGrid}>
            {BEDTIME_HOURS.map(h => (
              <button
                key={h}
                className={`${styles.pill} ${prefs.bedtimeHour === h ? styles.pillActive : ''}`}
                onClick={() => setBedtimeHour(h)}
                aria-pressed={prefs.bedtimeHour === h}
              >
                {hourLabel(h)}
              </button>
            ))}
          </div>
        </section>

        {inviteCode && (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t('settings.invite_title')}</p>
            <p className={styles.sectionHint}>{t('settings.invite_hint')}</p>
            <div className={styles.codeRow}>
              <span className={styles.codeText}>{inviteCode}</span>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? t('settings.invite_copied') : t('settings.invite_copy')}
              </button>
            </div>
          </section>
        )}

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.profile_title')}</p>
          <p className={styles.sectionHint}>{t('settings.your_name_label')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className={styles.input ?? ''}
              type="text"
              placeholder={t('settings.your_name_placeholder')}
              value={nameInput}
              onChange={e => {
                setNameInput(e.target.value);
                setNameSaved(false);
              }}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--tt-border)',
                background: 'var(--tt-surface)',
                color: 'var(--tt-text)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
            <button
              className={styles.copyBtn}
              onClick={async () => {
                await updateDisplayName(nameInput);
                setNameSaved(true);
                setTimeout(() => setNameSaved(false), 2000);
              }}
            >
              {nameSaved ? '✓' : t('settings.save_name')}
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.account_title')}</p>
          <button
            className={`${styles.pill} ${styles.pillFull}`}
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            {t('settings.sign_out')}
          </button>
        </section>

        {isAdmin && (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t('settings.admin_title')}</p>
            <p className={styles.sectionHint}>{t('settings.mock_hint')}</p>
            <button
              className={`${styles.pill} ${styles.pillFull} ${mockMode ? styles.pillActive : ''}`}
              onClick={handleToggleMockData}
              disabled={generating || babies.length === 0}
            >
              {generating
                ? mockProgress
                  ? t(mockMode ? 'settings.mock_restoring' : 'settings.mock_generating', {
                      done: mockProgress.done,
                      total: mockProgress.total,
                    })
                  : t('settings.mock_working')
                : mockMode
                  ? t('settings.mock_on')
                  : t('settings.mock_off')}
            </button>
            <p className={styles.sectionHint} style={{ marginTop: 16 }}>
              {t('settings.clear_hint')}
            </p>
            {mockError && (
              <p
                className={styles.sectionHint}
                style={{ color: 'var(--tt-urgency-overdue)', marginTop: 8 }}
              >
                {mockError}
              </p>
            )}
            {!clearConfirm ? (
              <button
                className={`${styles.pill} ${styles.pillFull} ${styles.pillDanger}`}
                onClick={() => setClearConfirm(true)}
                disabled={clearing}
              >
                {clearing ? t('settings.clearing') : t('settings.clear_logs')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  className={`${styles.pill} ${styles.pillFull} ${styles.pillDanger}`}
                  onClick={handleClearConfirmed}
                >
                  Delete all logs
                </button>
                <button
                  className={`${styles.pill} ${styles.pillFull}`}
                  onClick={() => setClearConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            {clearError && (
              <p
                className={styles.sectionHint}
                style={{ color: 'var(--tt-urgency-overdue)', marginTop: 8 }}
              >
                {clearError}
              </p>
            )}
          </section>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
}
