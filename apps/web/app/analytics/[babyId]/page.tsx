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
  computeTrendData,
  detectTransitionSignals,
  computeLearnedStats,
  computeWeightPercentile,
  computeHeightPercentile,
  formatPercentile,
  ageInMonths,
  useTranslation,
  formatMs,
  MIN_DAYS_FOR_MONTH_VIEW,
  getAgeWeeks,
} from '@tt/core';
import type { Baby, BabyAnalytics, TrendData, TransitionSignal } from '@tt/core';
import {
  BottleIcon,
  MoonIcon,
  HotelIcon,
  DiaperIcon,
  FoodIcon,
  MilestoneIcon,
  PersonIcon,
} from '@tt/ui';
import { BottomTabBar } from '../../../components/BottomTabBar';
import TrendBars from '../../../components/TrendBars';
import TrendSparkline from '../../../components/TrendSparkline';
import styles from './analytics.module.scss';

configure('');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInterval(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) {
    return `${m}m`;
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

/** Format a day slot ms into a short weekday label (Mon, Tue …) */
function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{icon}</span>
        <p className={styles.cardTitle}>{title}</p>
      </div>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

function TrendBlock({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.trendBlock}>
      <div className={styles.trendBlockHeader}>
        <span className={styles.trendBlockLabel}>{label}</span>
        {sublabel && <span className={styles.trendBlockSublabel}>{sublabel}</span>}
      </div>
      {children}
    </div>
  );
}

function DeltaPill({ ms, positive }: { ms: number; positive: boolean }) {
  const sign = positive ? '+' : '−';
  return (
    <span className={positive ? styles.pillPositive : styles.pillNegative}>
      {sign}
      {formatMs(ms)}
    </span>
  );
}

function SignalCard({ signal }: { signal: TransitionSignal }) {
  const { t } = useTranslation();
  const titleKey = `analytics.signal_${signal.kind === 'feed_interval_lengthening' ? 'interval' : signal.kind === 'nap_consolidating' ? 'nap' : signal.kind === 'sleep_stretch_milestone' ? 'sleep' : 'oz'}_title`;
  const detailKey = `analytics.signal_${signal.kind === 'feed_interval_lengthening' ? 'interval' : signal.kind === 'nap_consolidating' ? 'nap' : signal.kind === 'sleep_stretch_milestone' ? 'sleep' : 'oz'}_detail`;
  const detailParams =
    signal.kind === 'sleep_stretch_milestone' && signal.valueMs
      ? { duration: formatMs(signal.valueMs) }
      : {};
  return (
    <div className={styles.signalRow}>
      <span
        className={
          signal.direction === 'positive' ? styles.signalDotPositive : styles.signalDotWatch
        }
      />
      <div className={styles.signalText}>
        <p className={styles.signalTitle}>{t(titleKey)}</p>
        <p className={styles.signalDetail}>{t(detailKey, detailParams)}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter();
  const params = useParams<{ babyId: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { events, loading: eventsLoading } = useEventStore(!authLoading && isAuthenticated);
  const { prefs, setUnits } = usePreferences();
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
      <div className={styles.page}>
        <div className={styles.scroll}>
          {/* Back button */}
          <div
            className={styles.skeletonLine}
            style={{ height: 13, width: 60, marginBottom: 20 }}
          />
          {/* Heading */}
          <div
            className={styles.skeletonLine}
            style={{ height: 26, width: '45%', marginBottom: 8 }}
          />
          {/* Subheading */}
          <div
            className={styles.skeletonLine}
            style={{ height: 12, width: '32%', marginBottom: 24 }}
          />
          {/* Period tabs */}
          <div
            className={styles.skeletonLine}
            style={{ height: 36, width: '100%', marginBottom: 24, borderRadius: 6 }}
          />
          {/* Section cards */}
          {[72, 88, 72, 64].map((primaryH, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonCardHeader}>
                <div className={styles.skeletonIconCircle} />
                <div className={styles.skeletonLine} style={{ height: 10, width: 80 }} />
              </div>
              {/* Primary stat */}
              <div
                className={styles.skeletonLine}
                style={{ height: primaryH > 80 ? 32 : 32, width: '40%' }}
              />
              {/* Stat rows */}
              <div className={styles.skeletonStatsGrid}>
                {[55, 70, 50].map((w, j) => (
                  <div key={j} className={styles.skeletonStatRow}>
                    <div className={styles.skeletonLine} style={{ height: 12, width: `${w}%` }} />
                    <div className={styles.skeletonLine} style={{ height: 12, width: '18%' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const babyEvents = events.filter(e => e.babyId === baby.id);
  const now = new Date();
  const ageWeeks = getAgeWeeks(baby.birthDate);
  const isNewborn = ageWeeks < 15;

  // Schedule stage label shown in header (Stage 1 / 2 / 3 with age)
  const stage = ageWeeks < 15 ? 1 : ageWeeks < 78 ? 2 : 3;
  const stageAge = (() => {
    if (!baby.birthDate) return null;
    if (ageWeeks < 8) return `${ageWeeks}w`;
    if (ageWeeks < 52) return `${Math.round(ageWeeks / 4.33)}mo`;
    return `${Math.floor(ageWeeks / 52)}y`;
  })();

  const a: BabyAnalytics = computeAnalytics(babyEvents, now, period, baby.birthDate);

  // Trend data uses 14 days for Day/Week, 30 days for Month.
  const trendDays = period === 'month' ? 30 : 14;
  const trend: TrendData = computeTrendData(babyEvents, now, baby.birthDate, trendDays);
  const signals: TransitionSignal[] = detectTransitionSignals(babyEvents, now, baby.birthDate);

  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7;
  const subheading =
    period === 'day'
      ? t('analytics.today')
      : period === 'month'
        ? t('analytics.this_month', { range: rangeLabel(now, 30) })
        : t('analytics.this_week', { range: rangeLabel(now, 7) });

  const allTimes = babyEvents.map(e => new Date(e.startedAt).getTime());
  const totalDataSpanDays =
    allTimes.length > 0 ? (Date.now() - Math.min(...allTimes)) / (24 * 60 * 60 * 1000) : 0;

  // Learned stats for avg naps/day
  const learnedStats = computeLearnedStats(babyEvents, now);

  // Growth percentiles — only computed when baby has required fields
  const babyAgeMonths = ageInMonths(baby.birthDate, now);
  const weightPercentile =
    baby.weightKg != null && baby.sex != null && babyAgeMonths != null
      ? computeWeightPercentile(baby.weightKg, babyAgeMonths, baby.sex as 'male' | 'female')
      : null;
  const heightPercentile =
    baby.heightCm != null && baby.sex != null && babyAgeMonths != null
      ? computeHeightPercentile(baby.heightCm, babyAgeMonths, baby.sex as 'male' | 'female')
      : null;
  const showGrowth = baby.weightKg != null || baby.heightCm != null;

  // Unit conversion helpers — storage always kg/cm, display converts on the fly
  const isImperial = prefs.units === 'imperial';
  function fmtWeight(kg: number): string {
    return isImperial ? `${(kg * 2.2046).toFixed(1)} lbs` : `${kg.toFixed(1)} kg`;
  }
  function fmtHeight(cm: number): string {
    return isImperial ? `${(cm * 0.3937).toFixed(1)} in` : `${Math.round(cm)} cm`;
  }

  // Trend charts are only shown for Week and Month views (not Day — they are always multi-day).
  const showTrends = period !== 'day';

  // Trend chart x-axis day labels
  const trendDayLabels = trend.feedIntervalByDay.map(p => dayLabel(p.dayMs));

  // Whether there is enough data for trend charts (at least 3 non-null points)
  const hasFeedTrend =
    showTrends && trend.feedIntervalByDay.filter(p => p.value !== null).length >= 3;
  const hasSleepTrend =
    showTrends && trend.longestNightByDay.filter(p => p.value !== null).length >= 3;
  const hasOzTrend = showTrends && trend.ozPerDayByDay.filter(p => p.value !== null).length >= 3;

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.back()} type="button">
            {t('common.back')}
          </button>
          <h1 className={styles.heading}>{t('analytics.heading', { name: baby.name })}</h1>
          <p className={styles.subheading}>{subheading}</p>
          {stageAge && (
            <p className={styles.stageIndicator}>
              {t('analytics.stage_indicator', { stage, age: stageAge })}
            </p>
          )}
        </div>

        {/* ── Period tabs ─────────────────────────────────────────────────── */}
        <div className={styles.periodTabs}>
          {(['day', 'week', 'month'] as const).map(p => {
            const disabled = p === 'month' && totalDataSpanDays < MIN_DAYS_FOR_MONTH_VIEW;
            return (
              <button
                key={p}
                className={`${styles.periodTab} ${period === p ? styles.periodTabActive : ''} ${disabled ? styles.periodTabDisabled : ''}`}
                onClick={() => !disabled && setPeriod(p)}
                type="button"
                disabled={disabled}
              >
                {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
              </button>
            );
          })}
        </div>

        {a.dataSpanDays < periodDays - 1 && (
          <p className={styles.dataNotice}>
            {`${Math.ceil(a.dataSpanDays)} day${Math.ceil(a.dataSpanDays) === 1 ? '' : 's'} of data — partial ${period} view.`}
          </p>
        )}

        {/* ── Feeding summary ─────────────────────────────────────────────── */}
        <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.feeding')}>
          {a.totalOzThisWeek > 0 ? (
            <>
              <p className={styles.primaryStat}>{`${Math.round(a.totalOzThisWeek)} oz`}</p>
              <div className={styles.statsGrid}>
                {a.avgOzPerFeed != null && (
                  <StatRow
                    label={t('analytics.oz_per_feed_label')}
                    value={t('analytics.avg_oz_per_feed_stat', {
                      avg: a.avgOzPerFeed.toFixed(1),
                    })}
                  />
                )}
                {a.avgFeedIntervalMs != null && (
                  <StatRow
                    label={t('analytics.feed_interval_label')}
                    value={t('analytics.avg_interval_stat', {
                      interval: fmtInterval(a.avgFeedIntervalMs),
                    })}
                  />
                )}
                <StatRow label="feeds/day" value={`${a.avgFeedsPerDay.toFixed(1)}`} />
              </div>
              <p className={styles.benchmark}>
                {t('analytics.target_oz_feed_stat', { target: a.targetOzPerFeed })}
                {' · '}
                {fmtInterval(a.targetFeedIntervalMs)} target interval
              </p>
            </>
          ) : (
            <p className={styles.empty}>
              {t('analytics.feeding_empty', { period: 'this period' })}
            </p>
          )}
        </SectionCard>

        {/* ── Feeding trends ──────────────────────────────────────────────── */}
        {hasFeedTrend && (
          <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.feeding_trends')}>
            <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
            <TrendBlock
              label={t('analytics.oz_per_feed_label')}
              sublabel={t('analytics.target_label') + ` ${a.targetOzPerFeed} oz`}
            >
              <TrendSparkline
                data={trend.ozPerFeedByDay}
                benchmarkValue={a.targetOzPerFeed}
                ariaLabel={t('analytics.oz_per_feed_label')}
              />
            </TrendBlock>
            <TrendBlock
              label={t('analytics.feed_interval_label')}
              sublabel={t('analytics.target_label') + ` ${fmtInterval(trend.targetFeedIntervalMs)}`}
            >
              <TrendSparkline
                data={trend.feedIntervalByDay}
                benchmarkValue={trend.targetFeedIntervalMs}
                ariaLabel={t('analytics.feed_interval_label')}
              />
            </TrendBlock>
            <div className={styles.trendAxisRow}>
              {trendDayLabels
                .filter((_, i) => i % 2 === 0)
                .map((l, i) => (
                  <span key={i} className={styles.axisLabel}>
                    {l}
                  </span>
                ))}
            </div>
          </SectionCard>
        )}

        {/* ── Daily intake vs target ─────────────────────────────────────── */}
        {hasOzTrend && (
          <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.daily_intake')}>
            <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
            <TrendBlock
              label={t('analytics.oz_per_day_label')}
              sublabel={t('analytics.target_label') + ` ${trend.targetOzPerDay} oz`}
            >
              <TrendBars
                data={trend.ozPerDayByDay}
                benchmarkValue={trend.targetOzPerDay}
                height={72}
                ariaLabel={t('analytics.oz_per_day_label')}
              />
            </TrendBlock>
            <div className={styles.trendAxisRow}>
              {trendDayLabels
                .filter((_, i) => i % 2 === 0)
                .map((l, i) => (
                  <span key={i} className={styles.axisLabel}>
                    {l}
                  </span>
                ))}
            </div>
          </SectionCard>
        )}

        {/* ── Sleep summary ───────────────────────────────────────────────── */}
        {isNewborn ? (
          /* Stage 1: combine nap + night sleep into one "Newborn Sleep" block */
          <SectionCard icon={<MoonIcon size={14} />} title={t('analytics.newborn_sleep')}>
            {a.totalSleepMsThisWeek > 0 ? (
              <>
                <p className={styles.primaryStat}>{formatMs(a.totalSleepMsThisWeek)}</p>
                <div className={styles.statsGrid}>
                  <StatRow
                    label={t('analytics.nap_count_label')}
                    value={`${a.napCountThisWeek + a.nightSleepCountThisWeek} sessions`}
                  />
                  <StatRow
                    label={t('analytics.sleep_target_stat', {
                      min: formatMs(a.targetDailySleepMs.minMs),
                      max: formatMs(a.targetDailySleepMs.maxMs),
                    }).replace('target ', '')}
                    value={formatMs(a.avgDailySleepMs) + '/day avg'}
                  />
                </div>
                <p className={styles.benchmark}>
                  {`Target: ${formatMs(a.targetDailySleepMs.minMs)}–${formatMs(a.targetDailySleepMs.maxMs)}/day`}
                </p>
              </>
            ) : (
              <p className={styles.empty}>{t('analytics.naps_empty', { period: 'this period' })}</p>
            )}
          </SectionCard>
        ) : (
          <>
            {/* Stage 2+: separate nap and night sleep cards */}
            <SectionCard icon={<MoonIcon size={14} />} title={t('analytics.naps')}>
              {a.napCountThisWeek > 0 ? (
                <>
                  <p className={styles.primaryStat}>{formatMs(a.totalNapMsThisWeek)}</p>
                  <div className={styles.statsGrid}>
                    <StatRow
                      label={t('analytics.nap_count_label')}
                      value={`${a.napCountThisWeek} naps`}
                    />
                    {a.avgNapDurationMs != null && (
                      <StatRow
                        label={t('analytics.naps_avg', { avg: '' }).replace(': ', '')}
                        value={formatMs(a.avgNapDurationMs) + ' avg'}
                      />
                    )}
                    {a.longestNapMs != null && (
                      <StatRow
                        label={t('analytics.naps_longest', { longest: '' }).replace(': ', '')}
                        value={formatMs(a.longestNapMs)}
                      />
                    )}
                    {learnedStats.avgNapsPerDay != null && (
                      <StatRow
                        label={t('analytics.avg_naps_per_day_label')}
                        value={learnedStats.avgNapsPerDay.toFixed(1)}
                      />
                    )}
                  </div>
                  {showTrends && a.napDeltaVsLastWeek != null && (
                    <div className={styles.deltaRow}>
                      <DeltaPill
                        ms={Math.abs(a.napDeltaVsLastWeek)}
                        positive={a.napDeltaVsLastWeek >= 0}
                      />
                      <span className={styles.deltaLabel}>avg nap vs last week</span>
                    </div>
                  )}
                  <p
                    className={styles.benchmark}
                  >{`Target nap: ${formatMs(a.targetNapDurationMs)}`}</p>
                </>
              ) : (
                <p className={styles.empty}>
                  {t('analytics.naps_empty', { period: 'this period' })}
                </p>
              )}
            </SectionCard>

            <SectionCard icon={<HotelIcon size={14} />} title={t('analytics.night_sleep')}>
              {a.nightSleepCountThisWeek > 0 ? (
                <>
                  <p className={styles.primaryStat}>{formatMs(a.totalNightSleepMsThisWeek)}</p>
                  <div className={styles.statsGrid}>
                    <StatRow
                      label={t('analytics.night_stretch_label')}
                      value={t('analytics.longest_stretch_stat', {
                        duration: formatMs(a.avgNightSleepDurationMs ?? 0),
                      })}
                    />
                    <StatRow label="avg/night" value={formatMs(a.avgNightSleepDurationMs ?? 0)} />
                  </div>
                  {showTrends && a.sleepDeltaVsLastWeek != null && (
                    <div className={styles.deltaRow}>
                      <DeltaPill
                        ms={Math.abs(a.sleepDeltaVsLastWeek)}
                        positive={a.sleepDeltaVsLastWeek >= 0}
                      />
                      <span className={styles.deltaLabel}>total sleep vs last week</span>
                    </div>
                  )}
                  <p className={styles.benchmark}>
                    {`Avg daily: ${formatMs(a.avgDailySleepMs)} · Target: ${formatMs(a.targetDailySleepMs.minMs)}–${formatMs(a.targetDailySleepMs.maxMs)}/day`}
                  </p>
                </>
              ) : (
                <p className={styles.empty}>
                  {t('analytics.night_sleep_empty', { period: 'this period' })}
                </p>
              )}
            </SectionCard>
          </>
        )}

        {/* ── Sleep consolidation charts ───────────────────────────────────── */}
        {hasSleepTrend && (
          <SectionCard icon={<HotelIcon size={14} />} title={t('analytics.sleep_consolidation')}>
            <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
            <TrendBlock
              label={t('analytics.night_stretch_label')}
              sublabel={`target ${formatMs(a.targetDailySleepMs.minMs)}`}
            >
              <TrendBars
                data={trend.longestNightByDay}
                benchmarkValue={trend.targetDailySleepMs.minMs}
                height={72}
                ariaLabel={t('analytics.night_stretch_label')}
              />
            </TrendBlock>
            {trend.napCountByDay.filter(p => p.value !== null).length >= 3 && (
              <TrendBlock
                label={t('analytics.nap_count_label')}
                sublabel={`target ${trend.targetNapsPerDay} naps`}
              >
                <TrendBars
                  data={trend.napCountByDay}
                  benchmarkValue={trend.targetNapsPerDay}
                  height={56}
                  ariaLabel={t('analytics.nap_count_label')}
                />
              </TrendBlock>
            )}
            <div className={styles.trendAxisRow}>
              {trendDayLabels
                .filter((_, i) => i % 2 === 0)
                .map((l, i) => (
                  <span key={i} className={styles.axisLabel}>
                    {l}
                  </span>
                ))}
            </div>
          </SectionCard>
        )}

        {/* ── Transition signals ──────────────────────────────────────────── */}
        {showTrends && signals.length > 0 && (
          <SectionCard icon={<MilestoneIcon size={14} />} title={t('analytics.transition_signals')}>
            {signals.map((s, i) => (
              <SignalCard key={i} signal={s} />
            ))}
          </SectionCard>
        )}

        {/* ── Growth ──────────────────────────────────────────────────────── */}
        {showGrowth && (
          <SectionCard icon={<PersonIcon size={14} />} title={t('analytics.growth')}>
            <div className={styles.growthGrid}>
              {baby.weightKg != null && (
                <div className={styles.growthItem}>
                  <span className={styles.growthValue}>{fmtWeight(baby.weightKg)}</span>
                  <span className={styles.growthLabel}>{t('analytics.weight_label')}</span>
                  {weightPercentile != null && (
                    <span className={styles.growthPercentile}>
                      {formatPercentile(weightPercentile)}
                    </span>
                  )}
                </div>
              )}
              {baby.heightCm != null && (
                <div className={styles.growthItem}>
                  <span className={styles.growthValue}>{fmtHeight(baby.heightCm)}</span>
                  <span className={styles.growthLabel}>{t('analytics.height_label')}</span>
                  {heightPercentile != null && (
                    <span className={styles.growthPercentile}>
                      {formatPercentile(heightPercentile)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className={styles.unitsRow}>
              {(['metric', 'imperial'] as const).map(u => (
                <button
                  key={u}
                  className={`${styles.unitsPill} ${prefs.units === u ? styles.unitsPillActive : ''}`}
                  onClick={() => setUnits(u)}
                  type="button"
                  aria-pressed={prefs.units === u}
                >
                  {t(`settings.units_${u}`)}
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Diapers ─────────────────────────────────────────────────────── */}
        <SectionCard icon={<DiaperIcon size={14} />} title={t('analytics.diapers')}>
          {a.diaperCountThisWeek > 0 ? (
            <>
              <p className={styles.primaryStat}>{a.diaperCountThisWeek}</p>
              <div className={styles.statsGrid}>
                <StatRow
                  label={t('analytics.diapers_per_day', { avg: '' }).replace(' ', '')}
                  value={`${a.avgDiapersPerDay.toFixed(1)}/day`}
                />
                {a.msSinceLastDirty != null && (
                  <StatRow label="last dirty" value={`${fmtInterval(a.msSinceLastDirty)} ago`} />
                )}
              </div>
              {a.targetMinWetDiapersPerDay != null && (
                <p className={styles.benchmark}>
                  {`Min ${a.targetMinWetDiapersPerDay} wet/day (newborn adequacy)`}
                </p>
              )}
            </>
          ) : (
            <>
              <p className={styles.empty}>
                {t('analytics.diapers_empty', { period: 'this period' })}
              </p>
              {a.msSinceLastDirty != null && (
                <p
                  className={styles.detail}
                >{`Last dirty: ${fmtInterval(a.msSinceLastDirty)} ago`}</p>
              )}
            </>
          )}
        </SectionCard>

        {/* ── Solid foods ─────────────────────────────────────────────────── */}
        {a.foodCountThisWeek > 0 && (
          <SectionCard icon={<FoodIcon size={14} />} title={t('analytics.solids')}>
            <p className={styles.primaryStat}>{a.foodCountThisWeek}</p>
            <p className={styles.detail}>{t('analytics.solids_note', { name: baby.name })}</p>
          </SectionCard>
        )}

        {/* ── Sleep training ──────────────────────────────────────────────── */}
        {prefs.sleepTraining && (
          <SectionCard icon={<MoonIcon size={14} />} title="SLEEP TRAINING">
            <p className={styles.primaryStat}>{fmtInterval(a.selfSoothingWaitMs)}</p>
            <p className={styles.detail}>
              When nap crying starts, wait before responding. Reset timer if crying pauses.
            </p>
            <p className={styles.detail}>
              After wait: respond with a feed only — no rocking or comfort.
            </p>
          </SectionCard>
        )}

        {/* ── Milestones ──────────────────────────────────────────────────── */}
        {a.milestones.length > 0 && (
          <SectionCard icon={<MilestoneIcon size={14} />} title={t('analytics.milestones')}>
            {a.milestones.map(m => (
              <p key={m.id} className={styles.milestone}>
                {t('analytics.milestone_row', { notes: m.notes, date: formatDate(m.startedAt) })}
              </p>
            ))}
          </SectionCard>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
}
