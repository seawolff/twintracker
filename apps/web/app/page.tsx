'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  configure,
  useTranslation,
  useThemeContext,
  setSleepActive,
  eventLabel,
  formatTimeAgo,
  formatDuration,
  authorColor,
} from '@tt/core';
import type { Baby, LatestEventMap, TrackerEvent } from '@tt/core';
import { BabyCard, MoonIcon, SunIcon, BottleIcon, DiaperIcon, CloseIcon } from '@tt/ui';

import {
  DEMO_EMMA,
  DEMO_LUCAS,
  DEMO_MIA,
  buildDemoAnalyticsEvents,
  buildSingletonLatest,
  buildSingletonEvents,
  buildTwinLatest,
  buildTwinEvents,
  isBabySleeping,
} from './_demoData';
import styles from './landing.module.scss';
import { MarketingNav } from '../components/MarketingNav';
import { MarketingFooter } from '../components/MarketingFooter';
import { TwinsIcon } from '../components/TwinsIcon';
import { WaitlistModal } from '../components/WaitlistModal';
import WeeklyAnalyticsPanel from '../components/WeeklyAnalyticsPanel';

// Local-time constructor (NOT a UTC ISO string) so now.getHours() === 18 in getBabyInsight
// regardless of the user's timezone. A UTC string like '...T18:00:00Z' gives getHours() = 11
// in UTC-7, which shifts the computed bedtime 7h forward and breaks isBedtimeStretch.
// 6:30 PM → bedtimeRemainingMs = 30min → narrative "Bedtime in about 30 minutes · 7:00 PM."
const DEMO_NOW = new Date(2026, 3, 10, 18, 30, 0); // April 10, 2026 — 6:30 PM local
// Fixed sleep timestamps so toggling sleep always shows a 30m nap in history,
// regardless of actual wall-clock time (which can be far from DEMO_NOW).
const DEMO_SLEEP_START = new Date(DEMO_NOW.getTime() - 30 * 60_000).toISOString();
const DEMO_SLEEP_END = DEMO_NOW.toISOString();

configure('');

// ── Types ─────────────────────────────────────────────────────────────────────

type DemoMode = 'singleton' | 'twin';
type DemoTab = 'home' | 'history' | 'analytics';
type DemoBaby = Baby;

// Progressive row shading — same formula as HistoryFeed
const SHADE_PER_ROW = 0.015;
/** Demo phone tab order for the landing-page carousel. */
const DEMO_TAB_SEQUENCE: DemoTab[] = ['home', 'analytics', 'history'];
/** How long each landing-page demo tab stays visible before auto-advancing. */
const DEMO_TAB_AUTO_ROTATE_MS = 3_200;
/** Pause autoplay after a manual interaction so the mockup does not fight the user. */
const DEMO_TAB_INTERACTION_PAUSE_MS = 8_000;
// Token map for demo sub-components. useThemeContext() is time-based (6pm → day) and
// does NOT react to applyTheme(), so any component that must flip when the user toggles
// sleep should read from here instead of theme.text/border/etc.
const DEMO_THEME = {
  day: {
    text: '#000000',
    textMuted: '#aaaaaa',
    bg: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    accent: '#000000',
  },
  night: {
    text: '#ffffff',
    textMuted: '#555555',
    bg: '#000000',
    surface: '#1a1a1a',
    border: '#2a2a2a',
    accent: '#ffffff',
  },
} as const;

// ── Landing page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { t } = useTranslation();
  const [landingTheme, setLandingTheme] = useState<'day' | 'night'>('day');
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<DemoMode>('singleton');
  const [demoTab, setDemoTab] = useState<DemoTab>('home');
  // Suppress hydration mismatches in BabyCard (useTheme reads new Date() internally).
  // Render a skeleton on SSR + first client paint; swap to real demo after mount.
  const [mounted, setMounted] = useState(false);
  const demoAutoCyclePausedUntilRef = useRef(0);
  const [demoAutoCycleNonce, setDemoAutoCycleNonce] = useState(0);
  // States initialised synchronously from DEMO_NOW so SSR and client produce identical HTML.
  const [singletonLatest, setSingletonLatest] = useState<LatestEventMap>(() =>
    buildSingletonLatest(DEMO_NOW.getTime()),
  );
  const [singletonEvents, setSingletonEvents] = useState<TrackerEvent[]>(() =>
    buildSingletonEvents(DEMO_NOW.getTime()),
  );
  const [twinLatest, setTwinLatest] = useState<LatestEventMap>(() =>
    buildTwinLatest(DEMO_NOW.getTime()),
  );
  const [twinEvents, setTwinEvents] = useState<TrackerEvent[]>(() =>
    buildTwinEvents(DEMO_NOW.getTime()),
  );

  // Sync initial theme from the DOM attribute set by layout.tsx inline script.
  useEffect(() => {
    const domTheme = document.documentElement.dataset.theme as 'day' | 'night' | undefined;
    if (domTheme) {
      setLandingTheme(domTheme);
    }
  }, []);

  const pauseDemoTabAutoCycle = useCallback(() => {
    demoAutoCyclePausedUntilRef.current = Date.now() + DEMO_TAB_INTERACTION_PAUSE_MS;
    setDemoAutoCycleNonce(n => n + 1);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const pauseRemainingMs = Math.max(0, demoAutoCyclePausedUntilRef.current - Date.now());
    const delayMs = pauseRemainingMs > 0 ? pauseRemainingMs : DEMO_TAB_AUTO_ROTATE_MS;
    const timer = window.setTimeout(() => {
      setDemoTab(prev => {
        const currentIdx = DEMO_TAB_SEQUENCE.indexOf(prev);
        return DEMO_TAB_SEQUENCE[(currentIdx + 1) % DEMO_TAB_SEQUENCE.length];
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [mounted, demoMode, demoTab, demoAutoCycleNonce]);

  /** Apply a theme to React state, the CSS data-attribute, and the module-level sleep flag
   *  so BabyCard's internal useThemeContext() also flips. */
  const applyTheme = useCallback((next: 'day' | 'night') => {
    setSleepActive(next === 'night');
    document.documentElement.dataset.theme = next;
    setLandingTheme(next);
  }, []);

  /** Toggle sleep/wake for one demo baby. Pure UI state — no API calls. */
  const handleSleepToggle = useCallback(
    (babyId: string) => {
      pauseDemoTabAutoCycle();
      const latestMap = demoMode === 'singleton' ? singletonLatest : twinLatest;
      const sleeping = isBabySleeping(babyId, latestMap);

      if (sleeping) {
        // End the active nap — set endedAt to the fixed demo "now" in both latest map and events list.
        const updateMap = (prev: LatestEventMap): LatestEventMap => {
          const napKey = `${babyId}:nap`;
          const sleepKey = `${babyId}:sleep`;
          const activeKey =
            prev[napKey] && !prev[napKey].endedAt
              ? napKey
              : prev[sleepKey] && !prev[sleepKey].endedAt
                ? sleepKey
                : null;
          if (!activeKey) {
            return prev;
          }
          return { ...prev, [activeKey]: { ...prev[activeKey]!, endedAt: DEMO_SLEEP_END } };
        };
        const updateEvents = (prev: TrackerEvent[]): TrackerEvent[] =>
          prev.map(e =>
            e.babyId === babyId && (e.type === 'nap' || e.type === 'sleep') && !e.endedAt
              ? { ...e, endedAt: DEMO_SLEEP_END }
              : e,
          );

        if (demoMode === 'singleton') {
          setSingletonLatest(updateMap);
          setSingletonEvents(updateEvents);
        } else {
          setTwinLatest(updateMap);
          setTwinEvents(updateEvents);
        }

        // Only revert to day if the other twin (if any) is also now awake.
        const otherStillSleeping =
          demoMode === 'twin' &&
          [DEMO_LUCAS, DEMO_MIA]
            .filter(b => b.id !== babyId)
            .some(b => isBabySleeping(b.id, latestMap));
        if (!otherStillSleeping) {
          applyTheme('day');
        }
      } else {
        // Start a new nap using fixed demo timestamps so the history shows a consistent 30m duration.
        const event: TrackerEvent = {
          id: `demo-${babyId}-nap-${Date.now()}`,
          babyId,
          type: 'nap',
          startedAt: DEMO_SLEEP_START,
          createdAt: DEMO_SLEEP_START,
        };

        if (demoMode === 'singleton') {
          setSingletonLatest(prev => ({ ...prev, [`${babyId}:nap`]: event }));
          setSingletonEvents(prev => [event, ...prev]);
        } else {
          setTwinLatest(prev => ({ ...prev, [`${babyId}:nap`]: event }));
          setTwinEvents(prev => [event, ...prev]);
        }
        applyTheme('night');
      }
    },
    [demoMode, singletonLatest, twinLatest, applyTheme, pauseDemoTabAutoCycle],
  );

  /** Reset demo to a fresh initial state and switch modes. */
  const switchDemoMode = useCallback(
    (mode: DemoMode) => {
      pauseDemoTabAutoCycle();
      const nowMs = DEMO_NOW.getTime();
      setDemoMode(mode);
      setDemoTab('home');
      // Always start in day mode — clear any sleep state from the previous demo mode.
      setSleepActive(false);
      document.documentElement.dataset.theme = 'day';
      setLandingTheme('day');
      if (mode === 'singleton') {
        setSingletonLatest(buildSingletonLatest(nowMs));
        setSingletonEvents(buildSingletonEvents(nowMs));
      } else {
        setTwinLatest(buildTwinLatest(nowMs));
        setTwinEvents(buildTwinEvents(nowMs));
      }
    },
    [pauseDemoTabAutoCycle],
  );

  const handleDemoTabChange = useCallback(
    (tab: DemoTab) => {
      pauseDemoTabAutoCycle();
      setDemoTab(tab);
    },
    [pauseDemoTabAutoCycle],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSingleton = demoMode === 'singleton';
  const currentLatest = isSingleton ? singletonLatest : twinLatest;
  const currentEvents = isSingleton ? singletonEvents : twinEvents;
  const currentBabies = isSingleton ? [DEMO_EMMA] : [DEMO_LUCAS, DEMO_MIA];
  const currentAnalyticsBaby = currentBabies[0];
  const currentAnalyticsEvents = useMemo(
    () => buildDemoAnalyticsEvents(currentBabies, DEMO_NOW.getTime()),
    [currentBabies],
  );

  return (
    <div className={styles.page}>
      <MarketingNav
        theme={landingTheme}
        onToggle={() => applyTheme(landingTheme === 'day' ? 'night' : 'day')}
      />

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <TwinsIcon className={styles.heroLogo} />
          <h1 className={styles.wordmark}>{t('landing.logo')}</h1>
          <p className={styles.tagline}>{t('landing.tagline')}</p>
          <p className={styles.heroSub}>{t('landing.hero_sub')}</p>
          <div className={styles.ctas}>
            <a href="/login?mode=register" className={styles.ctaPrimary}>
              {t('landing.cta_web')}
            </a>
            <button className={styles.ctaSecondary} onClick={() => setWaitlistOpen(true)}>
              {t('landing.cta_app')}
            </button>
          </div>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.phoneDemoWrapper}>
            {mounted ? (
              <PhoneMockup
                mode={demoMode}
                tab={demoTab}
                latest={currentLatest}
                events={currentEvents}
                analyticsBaby={currentAnalyticsBaby}
                analyticsEvents={currentAnalyticsEvents}
                babies={currentBabies}
                now={DEMO_NOW}
                themeMode={landingTheme}
                onTabChange={handleDemoTabChange}
                onSleepToggle={handleSleepToggle}
              />
            ) : (
              <PhoneSkeleton />
            )}
            <div className={styles.demoToggle}>
              <button
                className={`${styles.demoToggleBtn} ${isSingleton ? styles.demoToggleActive : ''}`}
                onClick={() => switchDemoMode('singleton')}
              >
                {t('landing.demo_mode_singleton')}
              </button>
              <button
                className={`${styles.demoToggleBtn} ${!isSingleton ? styles.demoToggleActive : ''}`}
                onClick={() => switchDemoMode('twin')}
              >
                {t('landing.demo_mode_twin')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.features} id="features">
        <FeatureCard
          icon="⏱"
          title={t('landing.feat_schedule_title')}
          desc={t('landing.feat_schedule_desc')}
        />
        <FeatureCard
          icon="⇌"
          title={t('landing.feat_sync_title')}
          desc={t('landing.feat_sync_desc')}
        />
        <FeatureCard
          icon="↗"
          title={t('landing.feat_growth_title')}
          desc={t('landing.feat_growth_desc')}
        />
        <FeatureCard
          icon="🌐"
          title={t('landing.feat_i18n_title')}
          desc={t('landing.feat_i18n_desc')}
        />
      </section>

      <section className={styles.story}>
        <div className={styles.storyInner}>
          <img
            src="/wolff.jpg"
            alt={t('landing.founder_photo_alt')}
            className={styles.storyPhoto}
          />
          <div className={styles.storyText}>
            <h2 className={styles.storyTitle}>{t('landing.story_title')}</h2>
            <p className={styles.storyBody}>{t('landing.story_body')}</p>
            <p className={styles.storyByline}>{t('landing.founder_byline')}</p>
            <a
              href="/login?mode=register"
              className={styles.ctaPrimary}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('landing.story_cta')}
            </a>
          </div>
        </div>
      </section>

      <section className={styles.privacyPromise}>
        <h2 className={styles.privacyPromiseTitle}>{t('landing.privacy_promise_title')}</h2>
        <p className={styles.privacyPromiseIntro}>{t('landing.privacy_promise_intro')}</p>
        <div className={styles.privacyCards}>
          <PrivacyCard
            title={t('landing.privacy_promise_on_device_title')}
            desc={t('landing.privacy_promise_on_device_desc')}
          />
          <PrivacyCard
            title={t('landing.privacy_promise_no_share_title')}
            desc={t('landing.privacy_promise_no_share_desc')}
          />
          <PrivacyCard
            title={t('landing.privacy_promise_your_data_title')}
            desc={t('landing.privacy_promise_your_data_desc')}
          />
        </div>
      </section>

      <MarketingFooter />

      {waitlistOpen && <WaitlistModal onClose={() => setWaitlistOpen(false)} />}
    </div>
  );
}

// ── Phone mockup shell ────────────────────────────────────────────────────────

interface PhoneMockupProps {
  mode: DemoMode;
  tab: DemoTab;
  latest: LatestEventMap;
  events: TrackerEvent[];
  analyticsBaby: DemoBaby;
  analyticsEvents: TrackerEvent[];
  babies: DemoBaby[];
  now: Date;
  themeMode: 'day' | 'night';
  onTabChange: (tab: DemoTab) => void;
  onSleepToggle: (babyId: string) => void;
}

function PhoneMockup({
  mode,
  tab,
  latest,
  events,
  analyticsBaby,
  analyticsEvents,
  babies,
  now,
  themeMode,
  onTabChange,
  onSleepToggle,
}: PhoneMockupProps) {
  const sharedCardProps = useMemo(
    () => ({
      // All card action handlers are noops — demo is display-only except for the sleep strip.
      onLog: () => {},
      events,
      resetHour: 0,
      bedtimeHour: 19,
      wakeHour: 7,
      now,
    }),
    [events, now],
  );

  return (
    <div className={styles.phone}>
      {/* Content area — BabyCard(s) or scrollable history */}
      <div className={styles.phoneContent}>
        {tab === 'home' ? (
          // pointer-events: none so only the DemoSleepStrip overlay handles interaction.
          // Twins stack vertically (same as /home on mobile).
          <div className={styles.phoneCards}>
            {mode === 'twin' ? (
              // Each card gets its own position:relative wrapper so its DemoSleepStrip
              // (absolute, bottom:0) overlays only that card's action row.
              <>
                {[
                  { baby: DEMO_LUCAS, mt: 0 },
                  { baby: DEMO_MIA, mt: 6 },
                ].map(({ baby, mt }) => (
                  <div
                    key={baby.id}
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      marginTop: mt,
                    }}
                  >
                    <BabyCard {...sharedCardProps} baby={baby} latest={latest} />
                    <DemoSleepStrip
                      babies={[baby]}
                      latest={latest}
                      themeMode={themeMode}
                      onToggle={onSleepToggle}
                    />
                  </div>
                ))}
              </>
            ) : (
              // BabyCard fills all available height; DemoSleepStrip (absolute, bottom:0) overlays its action row.
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <BabyCard {...sharedCardProps} baby={DEMO_EMMA} latest={latest} />
              </div>
            )}
            {/* Singleton only: absolute overlay replaces BabyCard's action row with an interactive Sleep/Wake strip */}
            {mode === 'singleton' && (
              <DemoSleepStrip
                babies={babies}
                latest={latest}
                themeMode={themeMode}
                onToggle={onSleepToggle}
              />
            )}
          </div>
        ) : (
          <>
            {tab === 'history' ? (
              <DemoHistory events={events} babies={babies} now={now} themeMode={themeMode} />
            ) : (
              <DemoAnalytics baby={analyticsBaby} events={analyticsEvents} now={now} />
            )}
          </>
        )}
      </div>

      <DemoTabBar tab={tab} themeMode={themeMode} onTabChange={onTabChange} />
    </div>
  );
}

// ── Demo sleep strip ──────────────────────────────────────────────────────────
// ── Phone skeleton ────────────────────────────────────────────────────────────
// Rendered on SSR and the first client paint instead of PhoneMockup.
// Identical outer shell so layout doesn't shift on hydration.

function PhoneSkeleton() {
  return (
    <div className={styles.phone}>
      <div className={styles.phoneContent}>
        <div className={styles.phoneCards}>
          <div className={styles.skeletonCard}>
            <div className={styles.skeletonLine} style={{ height: 14, width: '30%' }} />
            <div
              className={styles.skeletonLine}
              style={{ height: 28, width: '55%', marginTop: 4 }}
            />
            <div
              className={styles.skeletonLine}
              style={{ height: 13, width: '70%', marginTop: 8 }}
            />
            <div className={styles.skeletonLine} style={{ height: 13, width: '50%' }} />
            <div className={styles.skeletonActions}>
              {[0, 1, 2].map(i => (
                <div key={i} className={styles.skeletonBtn} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Tab bar placeholder */}
      <div className={styles.skeletonTabBar} />
    </div>
  );
}

// Absolute overlay that covers BabyCard's 52px action row at the bottom.
// Renders one row regardless of baby count: Feed | [Sleep/Wake per baby] | Diaper.
// Feed and Diaper are visually dimmed and non-interactive; Sleep/Wake buttons are live.
// Twin mode: Feed | Lucas | Mia | Diaper (4 cells, baby name as label).
// Singleton mode: Feed | Sleep/Wake | Diaper (3 cells, action label).

function DemoSleepStrip({
  babies,
  latest,
  themeMode,
  onToggle,
}: {
  babies: { id: string; name: string }[];
  latest: LatestEventMap;
  themeMode: 'day' | 'night';
  onToggle: (babyId: string) => void;
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const isTwin = babies.length > 1;
  const dt = DEMO_THEME[themeMode];

  const btnBase: React.CSSProperties = {
    flex: 1,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    fontFamily: theme.fontMono,
    fontSize: isTwin ? 11 : 14,
    overflow: 'hidden',
  };

  return (
    <div
      style={{
        position: 'absolute' as const,
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        background: dt.surface,
        borderTop: `1px solid ${dt.border}`,
        display: 'flex',
        height: 52,
      }}
    >
      {/* Feed — dimmed, non-interactive */}
      <div style={{ ...btnBase, opacity: 0.35, color: dt.accent }} aria-hidden="true">
        <BottleIcon size={16} color={dt.accent} />
        {t('home.action_feed')}
      </div>

      {/* Sleep / Wake — one button per baby */}
      {babies.map((baby, idx) => {
        const sleeping = isBabySleeping(baby.id, latest);
        return (
          <button
            key={baby.id}
            onClick={() => onToggle(baby.id)}
            aria-label={
              sleeping
                ? t('landing.demo_wake_aria', { name: baby.name })
                : t('landing.demo_sleep_aria', { name: baby.name })
            }
            style={{
              ...btnBase,
              pointerEvents: 'all',
              cursor: 'pointer',
              color: dt.accent,
              borderLeft: `1px solid ${dt.border}`,
              // Only add right border before the Diaper cell (last sleep btn)
              borderRight: idx === babies.length - 1 ? `1px solid ${dt.border}` : 'none',
            }}
          >
            {sleeping ? (
              <SunIcon size={16} color={dt.accent} />
            ) : (
              <MoonIcon size={16} color={dt.accent} />
            )}
            {/* Twin: show baby name so each button is identifiable. Singleton: show action verb. */}
            {isTwin ? baby.name : sleeping ? t('landing.demo_wake') : t('landing.demo_sleep')}
          </button>
        );
      })}

      {/* Diaper — dimmed, non-interactive */}
      <div style={{ ...btnBase, opacity: 0.35, color: dt.accent }} aria-hidden="true">
        <DiaperIcon size={16} color={dt.accent} />
        {t('log_sheet.types.diaper')}
      </div>
    </div>
  );
}

// ── Demo tab bar ──────────────────────────────────────────────────────────────

function DemoTabBar({
  tab,
  themeMode,
  onTabChange,
}: {
  tab: DemoTab;
  themeMode: 'day' | 'night';
  onTabChange: (t: DemoTab) => void;
}) {
  const { t } = useTranslation();
  const dt = DEMO_THEME[themeMode];

  // Tab icons match the real BottomTabBar characters and 20px size.
  const TAB_ICONS: Record<'home' | 'history', string> = { home: '⌂', history: '◷' };
  const visibleTabs: Array<'home' | 'history'> = ['home', 'history'];
  const activeVisibleTab: 'home' | 'history' = tab === 'history' ? 'history' : 'home';

  return (
    <div
      style={{
        display: 'flex',
        borderTop: `1px solid ${dt.border}`,
        height: 56,
        flexShrink: 0,
        background: dt.bg,
      }}
    >
      {visibleTabs.map(key => (
        <button
          key={key}
          onClick={() => onTabChange(key)}
          aria-label={key === 'home' ? t('landing.demo_tab_home') : t('landing.demo_tab_history')}
          aria-current={activeVisibleTab === key ? 'page' : undefined}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeVisibleTab === key ? dt.text : dt.textMuted,
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          {TAB_ICONS[key]}
        </button>
      ))}
    </div>
  );
}

function DemoAnalytics({
  baby,
  events,
  now,
}: {
  baby: DemoBaby;
  events: TrackerEvent[];
  now: Date;
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' as const, padding: '12px 10px 16px' }}>
      <WeeklyAnalyticsPanel baby={baby} events={events} now={now} />
    </div>
  );
}

// ── Demo history ──────────────────────────────────────────────────────────────
// Matches /history visual style: section header + "+" add button, Clear-style
// progressive row shading, co-parent avatar dots, ✕ icon (non-functional in demo).

/** Mirrors rowBgHex from packages/ui/src/rowTextColor.ts (not re-exported from @tt/ui). */
function demoRowBg(idx: number, mode: 'day' | 'night'): string {
  const alpha = Math.min(1, idx * SHADE_PER_ROW);
  const v = mode === 'day' ? Math.round(255 * (1 - alpha)) : Math.round(255 * alpha);
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

function DemoHistory({
  events,
  babies,
  now,
  themeMode,
}: {
  events: TrackerEvent[];
  babies: { id: string; name: string }[];
  now: Date;
  themeMode: 'day' | 'night';
}) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const babyNames = useMemo(() => Object.fromEntries(babies.map(b => [b.id, b.name])), [babies]);
  const showBabyName = babies.length > 1;
  const dt = DEMO_THEME[themeMode];

  // All text uses dt.text — matches HistoryFeed.web.tsx where textColor = theme.text for every column.
  const cellStyle: React.CSSProperties = {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: dt.text,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto' as const }}>
      {/* Section header — matches HistoryFeed sectionHeader style */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 12px',
          borderBottom: `1px solid ${dt.border}`,
          background: dt.bg,
          position: 'sticky' as const,
          top: 0,
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: theme.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: dt.text,
          }}
        >
          {t('landing.demo_today').toUpperCase()}
        </span>
        {/* "+" add button — non-functional in demo, matches real history */}
        <span
          aria-hidden="true"
          style={{
            fontFamily: theme.fontMono,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            color: dt.text,
            opacity: 0.35,
          }}
        >
          +
        </span>
      </div>

      {events.length === 0 ? (
        <div
          style={{
            padding: '20px 12px',
            fontFamily: theme.fontMono,
            fontSize: 12,
            color: dt.textMuted,
            textAlign: 'center' as const,
          }}
        >
          {t('landing.demo_no_events')}
        </div>
      ) : (
        events.map((event, idx) => {
          const rowBg = demoRowBg(idx, themeMode);
          const label = eventLabel(event);
          const durationDetail =
            (event.type === 'nap' || event.type === 'sleep') && event.endedAt
              ? ` (${formatDuration(event.startedAt, event.endedAt)})`
              : null;
          const labelBase = durationDetail ? label.replace(durationDetail, '') : label;
          const displayTime = formatTimeAgo(event.startedAt, now);

          return (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: 50,
                padding: '8px 12px',
                borderBottom: `1px solid ${dt.border}`,
                background: rowBg,
                gap: 6,
              }}
            >
              {/* Co-parent avatar dot — matches HistoryFeed authorAvatar */}
              {event.loggedByName ? (
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: authorColor(event.loggedByName),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.fontMono,
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1,
                    }}
                  >
                    {event.loggedByName.charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                <div style={{ width: 18, height: 18, flexShrink: 0 }} />
              )}

              {/* Row main — baby name + label + time, all on one line */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  overflow: 'hidden',
                }}
              >
                {showBabyName && (
                  <span style={{ ...cellStyle, fontWeight: 600, flexShrink: 0 }}>
                    {babyNames[event.babyId] ?? ''}
                  </span>
                )}
                <span style={{ ...cellStyle, flex: 1 }}>
                  {labelBase}
                  {durationDetail && (
                    // fontSize: 12 matches HistoryFeed durationDetail style
                    <span style={{ fontSize: 12 }}>{durationDetail}</span>
                  )}
                </span>
                <span style={{ ...cellStyle, fontSize: 11, flexShrink: 0 }}>{displayTime}</span>
              </div>

              {/* ✕ icon — non-functional in demo, shows the delete affordance */}
              <div
                aria-hidden="true"
                style={{ opacity: 0.35, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              >
                <CloseIcon size={14} color={dt.text} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Static marketing cards ────────────────────────────────────────────────────

function PrivacyCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.privacyCard}>
      <h3 className={styles.privacyCardTitle}>{title}</h3>
      <p className={styles.privacyCardDesc}>{desc}</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className={styles.featureCard}>
      <span className={styles.featureIcon} aria-hidden="true">
        {icon}
      </span>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDesc}>{desc}</p>
    </div>
  );
}
