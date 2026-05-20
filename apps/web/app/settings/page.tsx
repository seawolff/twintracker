'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import {
  usePreferences,
  useAuth,
  useEventStore,
  api,
  generateMockEvents,
  useTranslation,
  FEEDBACK_MAX_MESSAGE_LENGTH,
  BEDTIME_HOURS,
  WAKE_HOURS,
  hourLabel,
  getAgeWeeks,
  authorColor,
  todayLocalDateInputValue,
} from '@tt/core';
import type { Baby, LogEventPayload, TrackerEvent } from '@tt/core';
import { BottomTabBar } from '../../components/BottomTabBar';
import { SwitchRow } from '../../components/SwitchRow';
import { copyToClipboard } from '../../utils/clipboard';
import styles from './settings.module.scss';

export default function SettingsPage() {
  const router = useRouter();
  const {
    prefs,
    setTwinSync,
    setBedtimeHour,
    setWakeHour,
    setSleepTraining,
    setUnits,
    setTimeFormat,
  } = usePreferences();
  const {
    isAdmin,
    inviteCode,
    logout,
    deleteAccount,
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportBabyId, setExportBabyId] = useState('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [members, setMembers] = useState<{ id: string; displayName?: string | null }[]>([]);
  const [mockMode, setMockMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('tt_mock_mode') === 'true',
  );
  const [generating, setGenerating] = useState(false);
  const [mockProgress, setMockProgress] = useState<{ done: number; total: number } | null>(null);
  const [mockError, setMockError] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const isAuthLoading = useDelayedLoading(authLoading);
  const allStage1 =
    babies.length > 0 && babies.every(b => b.birthDate != null && getAgeWeeks(b.birthDate) < 15);

  // Prevent preferences-based hydration mismatch: server renders with DEFAULT
  // prefs (no localStorage), client reads real localStorage. Guard all pref-
  // dependent rendering until after first client paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    api.babies.list().then(setBabies).catch(console.error);
    api.auth.householdMembers().then(setMembers).catch(console.error);
  }, [authLoading, isAuthenticated]);

  function handleCopy() {
    if (!inviteCode) {
      return;
    }
    const text = t('settings.invite_share_message', { code: inviteCode });
    copyToClipboard(text, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  async function handleExportData() {
    setExporting(true);
    setExportError(null);
    const opts = {
      from: exportFrom || undefined,
      to: exportTo || undefined,
      babyId: exportBabyId || undefined,
    };
    try {
      const date = todayLocalDateInputValue();
      if (exportFormat === 'pdf') {
        const blob = await api.events.exportPdf(opts);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `twintracker-report-${date}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const csv = await api.events.exportCsv(opts);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `twintracker-export-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setExportError(t('settings.export_error'));
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/login');
    } catch {
      setDeleteError(t('settings.delete_account_hint'));
      setDeleting(false);
    }
  }

  async function handleFeedbackSubmit() {
    if (!feedbackRating) {
      return;
    }
    setFeedbackSubmitting(true);
    try {
      await api.feedback.submit({
        rating: feedbackRating,
        message: feedbackMessage.trim() || undefined,
      });
      setFeedbackDone(true);
      setFeedbackRating(null);
      setFeedbackMessage('');
    } catch {
      /* silent — success state not shown on error, user can retry */
    } finally {
      setFeedbackSubmitting(false);
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

  if (!mounted || isAuthLoading) {
    return (
      <div className={styles.page}>
        <BottomTabBar />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <div className={styles.headingRow}>
          <h1 className={styles.heading}>{t('settings.heading')}</h1>
          <button
            className={styles.signOutBtn}
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            {t('settings.sign_out')}
          </button>
        </div>

        {babies.length >= 2 && (
          <section className={styles.section}>
            <SwitchRow
              id="settingsTwinSync"
              label={t('settings.twin_sync_title')}
              hint={t('settings.twin_sync_hint')}
              checked={prefs.twinSync}
              onChange={setTwinSync}
            />
          </section>
        )}

        <section className={styles.section}>
          <SwitchRow
            id="settingsSleepTraining"
            label={t('settings.sleep_training_title')}
            hint={t('settings.sleep_training_hint')}
            checked={prefs.sleepTraining}
            onChange={setSleepTraining}
          />
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.units_title')}</p>
          <p className={styles.sectionHint}>{t('settings.units_hint')}</p>
          <div className={styles.pillGrid}>
            {(['metric', 'imperial'] as const).map(u => (
              <button
                key={u}
                className={`${styles.pill} ${prefs.units === u ? styles.pillActive : ''}`}
                onClick={() => setUnits(u)}
                type="button"
                aria-pressed={prefs.units === u}
              >
                {t(`settings.units_${u}`)}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.time_format_title')}</p>
          <p className={styles.sectionHint}>{t('settings.time_format_hint')}</p>
          <div className={styles.pillGrid}>
            {(['12h', '24h'] as const).map(format => (
              <button
                key={format}
                className={`${styles.pill} ${prefs.timeFormat === format ? styles.pillActive : ''}`}
                onClick={() => setTimeFormat(format)}
                type="button"
                aria-pressed={prefs.timeFormat === format}
              >
                {t(`settings.time_format_${format}`)}
              </button>
            ))}
          </div>
        </section>

        {allStage1 ? (
          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t('settings.wake_title')}</p>
            <p className={styles.sectionHint}>{t('settings.stage1_bedtime_note')}</p>
          </section>
        ) : (
          <>
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
                    {hourLabel(h, prefs.timeFormat)}
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
                    {hourLabel(h, prefs.timeFormat)}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.household_title')}</p>

          {/* Member avatars */}
          {members.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              {members.map(m => {
                const name = m.displayName ?? '?';
                const color = authorColor(name);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#fff',
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--tt-text-dim)',
                        maxWidth: 52,
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Your name */}
          <p className={styles.sectionHint}>{t('settings.household_your_name_label')}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: inviteCode ? 16 : 0 }}>
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

          {/* Invite code */}
          {inviteCode && (
            <>
              <p className={styles.sectionHint} style={{ marginTop: 16 }}>
                {t('settings.invite_hint')}
              </p>
              <div className={styles.codeRow}>
                <span className={styles.codeText}>{inviteCode}</span>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? t('settings.invite_copied') : t('settings.invite_copy')}
                </button>
              </div>
            </>
          )}
        </section>

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.your_data_title')}</p>
          <p className={styles.sectionHint}>{t('settings.export_data_hint')}</p>
          <div className={styles.exportFilters}>
            <div className={styles.exportFilterRow}>
              <label className={styles.exportFilterLabel}>{t('settings.export_from_label')}</label>
              <input
                type="date"
                className={styles.exportDateInput}
                value={exportFrom}
                onChange={e => setExportFrom(e.target.value)}
                aria-label={t('settings.export_from_label')}
              />
            </div>
            <div className={styles.exportFilterRow}>
              <label className={styles.exportFilterLabel}>{t('settings.export_to_label')}</label>
              <input
                type="date"
                className={styles.exportDateInput}
                value={exportTo}
                onChange={e => setExportTo(e.target.value)}
                aria-label={t('settings.export_to_label')}
              />
            </div>
            {babies.length > 1 && (
              <div className={styles.exportFilterRow}>
                <label className={styles.exportFilterLabel}>
                  {t('settings.export_baby_label')}
                </label>
                <select
                  className={styles.exportDateInput}
                  value={exportBabyId}
                  onChange={e => setExportBabyId(e.target.value)}
                  aria-label={t('settings.export_baby_label')}
                >
                  <option value="">{t('settings.export_baby_all')}</option>
                  {babies.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className={styles.exportFormatRow}>
            <button
              className={`${styles.pill} ${exportFormat === 'csv' ? styles.pillActive : ''}`}
              onClick={() => setExportFormat('csv')}
              aria-pressed={exportFormat === 'csv'}
            >
              {t('settings.export_format_csv')}
            </button>
            <button
              className={`${styles.pill} ${exportFormat === 'pdf' ? styles.pillActive : ''}`}
              onClick={() => setExportFormat('pdf')}
              aria-pressed={exportFormat === 'pdf'}
            >
              {t('settings.export_format_pdf')}
            </button>
          </div>
          {exportError && <p className={styles.exportError}>{exportError}</p>}
          <button
            className={`${styles.pill} ${styles.pillFull}`}
            onClick={handleExportData}
            disabled={exporting}
            style={{ marginTop: 8 }}
          >
            {exporting ? t('settings.exporting_data') : t('settings.export_data')}
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
                  {t('settings.clear_logs')}
                </button>
                <button
                  className={`${styles.pill} ${styles.pillFull}`}
                  onClick={() => setClearConfirm(false)}
                >
                  {t('common.cancel')}
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

        <section className={styles.section}>
          <p className={styles.sectionTitle}>{t('settings.feedback_title')}</p>
          <p className={styles.sectionHint}>{t('settings.feedback_hint')}</p>
          {feedbackDone ? (
            <p className={styles.feedbackSuccess}>{t('settings.feedback_success')}</p>
          ) : (
            <>
              <div className={styles.feedbackEmoji}>
                {(['😞', '😐', '🙂', '😃', '🤩'] as const).map((emoji, i) => {
                  const rating = i + 1;
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-label={t('settings.feedback_rating_label', { n: rating })}
                      aria-pressed={feedbackRating === rating}
                      className={`${styles.emojiBtn} ${feedbackRating === rating ? styles.emojiBtnActive : ''}`}
                      onClick={() => setFeedbackRating(rating)}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <textarea
                className={styles.feedbackTextarea}
                placeholder={t('settings.feedback_placeholder')}
                value={feedbackMessage}
                onChange={e => setFeedbackMessage(e.target.value)}
                rows={3}
                maxLength={FEEDBACK_MAX_MESSAGE_LENGTH}
              />
              <button
                className={`${styles.pill} ${styles.pillFull}`}
                onClick={handleFeedbackSubmit}
                disabled={feedbackSubmitting || !feedbackRating}
                style={{ marginTop: 8 }}
              >
                {t('settings.feedback_submit')}
              </button>
            </>
          )}
        </section>

        <section className={`${styles.section} ${styles.dangerZone}`}>
          <p className={styles.sectionTitle}>{t('settings.danger_zone_title')}</p>
          <p className={styles.sectionHint}>{t('settings.danger_zone_hint')}</p>
          {!deleteConfirm ? (
            <button
              className={`${styles.pill} ${styles.pillFull} ${styles.pillDanger}`}
              onClick={() => setDeleteConfirm(true)}
              disabled={deleting}
            >
              {t('settings.delete_account')}
            </button>
          ) : (
            <>
              <p className={styles.sectionHint} style={{ marginBottom: 8 }}>
                {t('settings.delete_account_hint')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`${styles.pill} ${styles.pillFull} ${styles.pillDanger}`}
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? t('settings.deleting_account') : t('settings.delete_account_confirm')}
                </button>
                <button
                  className={`${styles.pill} ${styles.pillFull}`}
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
          {deleteError && (
            <p
              className={styles.sectionHint}
              style={{ color: 'var(--tt-urgency-overdue)', marginTop: 8 }}
            >
              {deleteError}
            </p>
          )}
        </section>
      </div>

      <BottomTabBar />
    </div>
  );
}
