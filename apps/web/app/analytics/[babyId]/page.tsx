'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  configure,
  useAuth,
  useEventStore,
  usePreferences,
  api,
  computeAnalytics,
  useTranslation,
  formatMs,
} from '@tt/core';
import type { Baby, BabyAnalytics } from '@tt/core';
import { BottleIcon, MoonIcon, HotelIcon, DiaperIcon, FoodIcon, MilestoneIcon } from '@tt/ui';
import { BottomTabBar } from '../../../components/BottomTabBar';
import styles from './analytics.module.scss';

configure('');

function formatInterval(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) {
    return `${m} min`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function rangeLabel(now: Date, days: number): string {
  const end = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${start} – ${end}`;
}

function NarrativeBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHeader}>
        <span className={styles.blockIcon}>{icon}</span>
        <p className={styles.blockTitle}>{title}</p>
      </div>
      <div className={styles.blockBody}>{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const params = useParams<{ babyId: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { events, loading: eventsLoading } = useEventStore(!authLoading && isAuthenticated);
  const { prefs } = usePreferences();
  const { t } = useTranslation();
  const [baby, setBaby] = useState<Baby | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !params.babyId) {
      return;
    }
    api.babies
      .list()
      .then(babies => setBaby(babies.find(b => b.id === params.babyId) ?? null))
      .catch(console.error);
  }, [authLoading, isAuthenticated, params.babyId]);

  if (authLoading || eventsLoading || !baby) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const babyEvents = events.filter(e => e.babyId === baby.id);
  const now = new Date();
  const a: BabyAnalytics = computeAnalytics(
    babyEvents,
    now,
    prefs.wakeHour,
    period,
    baby.birthDate,
  );

  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;
  const periodLabel = period === 'day' ? 'today' : period === 'month' ? 'this month' : 'this week';
  const subheading =
    period === 'day' ? 'Today' : `Last ${periodDays} days · ${rangeLabel(now, periodDays)}`;

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.back()}>
            {t('common.back')}
          </button>
          <h1 className={styles.heading}>{t('analytics.heading', { name: baby.name })}</h1>
          <p className={styles.subheading}>{subheading}</p>
        </div>

        <div className={styles.periodTabs}>
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              className={`${styles.periodTab} ${period === p ? styles.periodTabActive : ''}`}
              onClick={() => setPeriod(p)}
              type="button"
            >
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>

        {a.dataSpanDays < periodDays - 1 && (
          <p className={styles.dataNotice}>
            {`Only ${Math.ceil(a.dataSpanDays)} day${Math.ceil(a.dataSpanDays) === 1 ? '' : 's'} of data — partial ${period} view.`}
          </p>
        )}

        <NarrativeBlock icon={<BottleIcon size={14} />} title={t('analytics.feeding')}>
          {a.totalOzThisWeek > 0 ? (
            <>
              <p className={styles.stat}>
                {t('analytics.feeding_oz', {
                  total: Math.round(a.totalOzThisWeek),
                  period: periodLabel,
                })}
              </p>
              {a.avgOzPerFeed != null && (
                <p className={styles.detail}>
                  {t('analytics.feeding_avg_oz', { avg: a.avgOzPerFeed.toFixed(1) })}
                </p>
              )}
              {a.avgFeedIntervalMs != null && (
                <p className={styles.detail}>
                  {t('analytics.feeding_interval', {
                    interval: formatInterval(a.avgFeedIntervalMs),
                  })}
                </p>
              )}
              <p className={styles.detail}>{`${a.avgFeedsPerDay.toFixed(1)} feeds/day`}</p>
              <p className={styles.benchmark}>
                {`Target: ${a.targetOzPerFeed} oz/feed · every ${formatInterval(a.targetFeedIntervalMs)}`}
              </p>
              <p className={styles.benchmark}>
                {`Avg: ${a.avgOzPerDay.toFixed(1)} oz/day · Max rec: ${a.targetDailyOzMax} oz/day`}
              </p>
            </>
          ) : (
            <p className={styles.empty}>{t('analytics.feeding_empty', { period: periodLabel })}</p>
          )}
        </NarrativeBlock>

        <NarrativeBlock icon={<MoonIcon size={14} />} title={t('analytics.naps')}>
          {a.napCountThisWeek > 0 ? (
            <>
              <p className={styles.stat}>
                {a.napCountThisWeek === 1
                  ? t('analytics.naps_total', {
                      total: formatMs(a.totalNapMsThisWeek),
                      count: a.napCountThisWeek,
                      period: periodLabel,
                    })
                  : t('analytics.naps_total_plural', {
                      total: formatMs(a.totalNapMsThisWeek),
                      count: a.napCountThisWeek,
                      period: periodLabel,
                    })}
              </p>
              {a.avgNapDurationMs != null && (
                <p className={styles.detail}>
                  {t('analytics.naps_avg', { avg: formatMs(a.avgNapDurationMs) })}
                </p>
              )}
              {a.longestNapMs != null && (
                <p className={styles.detail}>
                  {t('analytics.naps_longest', { longest: formatMs(a.longestNapMs) })}
                </p>
              )}
              <p className={styles.benchmark}>{`Target nap: ${formatMs(a.targetNapDurationMs)}`}</p>
            </>
          ) : (
            <p className={styles.empty}>{t('analytics.naps_empty', { period: periodLabel })}</p>
          )}
        </NarrativeBlock>

        <NarrativeBlock icon={<HotelIcon size={14} />} title={t('analytics.night_sleep')}>
          {a.nightSleepCountThisWeek > 0 ? (
            <>
              <p className={styles.stat}>
                {a.nightSleepCountThisWeek === 1
                  ? t('analytics.night_sleep_total', {
                      total: formatMs(a.totalNightSleepMsThisWeek),
                      count: a.nightSleepCountThisWeek,
                      period: periodLabel,
                    })
                  : t('analytics.night_sleep_total_plural', {
                      total: formatMs(a.totalNightSleepMsThisWeek),
                      count: a.nightSleepCountThisWeek,
                      period: periodLabel,
                    })}
              </p>
              {a.avgNightSleepDurationMs != null && (
                <p className={styles.detail}>
                  {t('analytics.night_sleep_avg', { avg: formatMs(a.avgNightSleepDurationMs) })}
                </p>
              )}
              {a.sleepDeltaVsLastWeek != null && (
                <p className={styles.detail}>
                  {a.sleepDeltaVsLastWeek >= 0
                    ? t('analytics.sleep_more', {
                        delta: formatMs(Math.abs(a.sleepDeltaVsLastWeek)),
                      })
                    : t('analytics.sleep_less', {
                        delta: formatMs(Math.abs(a.sleepDeltaVsLastWeek)),
                      })}
                </p>
              )}
              <p className={styles.benchmark}>
                {`Avg daily sleep: ${formatMs(a.avgDailySleepMs)} · Target: ${formatMs(a.targetDailySleepMs.minMs)}–${formatMs(a.targetDailySleepMs.maxMs)}`}
              </p>
            </>
          ) : (
            <p className={styles.empty}>
              {t('analytics.night_sleep_empty', { period: periodLabel })}
            </p>
          )}
        </NarrativeBlock>

        <NarrativeBlock icon={<DiaperIcon size={14} />} title={t('analytics.diapers')}>
          {a.diaperCountThisWeek > 0 ? (
            <>
              <p className={styles.stat}>
                {t('analytics.diapers_count', {
                  count: a.diaperCountThisWeek,
                  period: periodLabel,
                })}
              </p>
              <p className={styles.detail}>
                {t('analytics.diapers_per_day', { avg: a.avgDiapersPerDay.toFixed(1) })}
              </p>
              {a.targetMinWetDiapersPerDay != null && (
                <p className={styles.benchmark}>
                  {`Min wet diapers/day: ${a.targetMinWetDiapersPerDay} (newborn adequacy)`}
                </p>
              )}
            </>
          ) : (
            <p className={styles.empty}>{t('analytics.diapers_empty', { period: periodLabel })}</p>
          )}
          {a.msSinceLastDirty != null && (
            <p className={styles.detail}>
              {`Last dirty: ${formatInterval(a.msSinceLastDirty)} ago`}
            </p>
          )}
        </NarrativeBlock>

        {a.foodCountThisWeek > 0 && (
          <NarrativeBlock icon={<FoodIcon size={14} />} title={t('analytics.solids')}>
            <p className={styles.stat}>
              {a.foodCountThisWeek === 1
                ? t('analytics.solids_count_one', {
                    count: a.foodCountThisWeek,
                    period: periodLabel,
                  })
                : t('analytics.solids_count_other', {
                    count: a.foodCountThisWeek,
                    period: periodLabel,
                  })}
            </p>
            <p className={styles.detail}>{t('analytics.solids_note', { name: baby.name })}</p>
          </NarrativeBlock>
        )}

        {prefs.sleepTraining && (
          <NarrativeBlock icon={<MoonIcon size={14} />} title="SLEEP TRAINING">
            <p className={styles.stat}>
              {`Self-soothing wait: ${formatInterval(a.selfSoothingWaitMs)}`}
            </p>
            <p className={styles.detail}>
              {'When nap crying starts, wait before responding. Reset timer if crying pauses.'}
            </p>
            <p className={styles.detail}>
              {'After wait: respond with a feed only — no rocking or comfort.'}
            </p>
          </NarrativeBlock>
        )}

        {a.milestones.length > 0 && (
          <NarrativeBlock icon={<MilestoneIcon size={14} />} title={t('analytics.milestones')}>
            {a.milestones.map(m => (
              <p key={m.id} className={styles.milestone}>
                {t('analytics.milestone_row', { notes: m.notes, date: formatDate(m.startedAt) })}
              </p>
            ))}
          </NarrativeBlock>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
}
