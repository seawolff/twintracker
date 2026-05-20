'use client';

import {
  computeAnalytics,
  computeLearnedStats,
  computeTrendData,
  detectTransitionSignals,
  formatMs,
  getAgeWeeks,
  useTranslation,
} from '@tt/core';
import type {
  Baby,
  TrackerEvent,
  TransitionSignal,
  TrendData,
  WeaningCrossoverPoint,
} from '@tt/core';
import { BottleIcon, FoodIcon, HotelIcon, MilestoneIcon, MoonIcon, PumpIcon } from '@tt/ui';

import TrendBars from './TrendBars';
import TrendSparkline from './TrendSparkline';
import styles from '../app/analytics/[babyId]/analytics.module.scss';

const MS_PER_HOUR = 60 * 60_000;

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

function formatExactTotal(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function rangeLabel(now: Date, days: number): string {
  const end = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const start = new Date(now.getTime() - days * 24 * MS_PER_HOUR).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${start} – ${end}`;
}

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
}

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

function WeaningCrossoverChart({
  data,
  ariaLabel,
}: {
  data: WeaningCrossoverPoint[];
  ariaLabel: string;
}) {
  const height = 82;
  const count = data.length;
  const topPad = 6;
  const bottomPad = 4;
  const drawH = height - topPad - bottomPad;
  const xFor = (index: number) => (count <= 1 ? 50 : (index / (count - 1)) * 100);
  const yFor = (share: number) => topPad + (1 - share) * drawH;
  const bottlePoints = data
    .map((point, i) =>
      point.bottleShare == null
        ? null
        : `${xFor(i).toFixed(2)},${yFor(point.bottleShare).toFixed(2)}`,
    )
    .filter(Boolean)
    .join(' ');
  const solidsPoints = data
    .map((point, i) =>
      point.solidsShare == null
        ? null
        : `${xFor(i).toFixed(2)},${yFor(point.solidsShare).toFixed(2)}`,
    )
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel}
      role="img"
    >
      <line x1="0" y1={yFor(0.5)} x2="100" y2={yFor(0.5)} className={styles.crossoverMidline} />
      <polyline points={bottlePoints} className={styles.crossoverBottleLine} />
      <polyline points={solidsPoints} className={styles.crossoverSolidsLine} />
      {data.map((point, i) => {
        if (point.bottleShare == null || point.solidsShare == null) {
          return null;
        }
        const x = xFor(i);
        return (
          <g key={point.dayMs}>
            <circle
              cx={x}
              cy={yFor(point.bottleShare)}
              r={1.4}
              className={styles.crossoverBottleDot}
            />
            <circle
              cx={x}
              cy={yFor(point.solidsShare)}
              r={1.4}
              className={styles.crossoverSolidsDot}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function WeeklyAnalyticsPanel({
  baby,
  events,
  now,
  showHeader = true,
}: {
  baby: Baby;
  events: TrackerEvent[];
  now: Date;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const a = computeAnalytics(events, now, 'week', baby.birthDate);
  const trend: TrendData = computeTrendData(events, now, baby.birthDate, 14);
  const signals = detectTransitionSignals(events, now, baby.birthDate);
  const learnedStats = computeLearnedStats(events, now);
  const ageWeeks = getAgeWeeks(baby.birthDate);
  const isNewborn = ageWeeks < 15;
  const stage = ageWeeks < 15 ? 1 : ageWeeks < 78 ? 2 : 3;
  const stageAge = ageWeeks < 8 ? `${ageWeeks}w` : `${Math.floor(ageWeeks / 4.345)}mo`;
  const trendDayLabels = trend.feedIntervalByDay.map(p => dayLabel(p.dayMs));
  const hasFeedTrend = trend.feedIntervalByDay.filter(p => p.value !== null).length >= 3;
  const hasSleepTrend = trend.longestNightByDay.filter(p => p.value !== null).length >= 3;
  const hasOzTrend = trend.ozPerDayByDay.filter(p => p.value !== null).length >= 3;
  const hasWeaningCrossover =
    trend.weaningCrossoverByDay.filter(p => p.bottleShare !== null && p.solidsShare !== null)
      .length >= 3 && trend.solidMealsByDay.some(p => p.value !== null);
  const hasPumpTrend = trend.pumpedOzPerDay.filter(p => p.value !== null).length >= 3;

  return (
    <>
      {showHeader && (
        <div className={styles.header}>
          <h1 className={styles.heading}>{t('analytics.heading', { name: baby.name })}</h1>
          <p className={styles.subheading}>
            {t('analytics.this_week', { range: rangeLabel(now, 7) })}
          </p>
          <p className={styles.stageIndicator}>
            {t('analytics.stage_indicator', { stage, age: stageAge })}
          </p>
        </div>
      )}

      <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.feeding')}>
        {a.totalOzThisWeek > 0 ? (
          <>
            <p className={styles.primaryStat}>{`${formatExactTotal(a.totalOzThisWeek)} oz`}</p>
            <div className={styles.statsGrid}>
              {a.avgOzPerFeed != null && (
                <StatRow
                  label={t('analytics.oz_per_feed_label')}
                  value={t('analytics.avg_oz_per_feed_stat', { avg: a.avgOzPerFeed.toFixed(1) })}
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
              <StatRow
                label={t('analytics.feeds_per_day_stat', { count: 0 }).replace('0 ', '')}
                value={a.avgFeedsPerDay.toFixed(1)}
              />
            </div>
            <p className={styles.benchmark}>
              {t('analytics.target_oz_feed_stat', { target: a.targetOzPerFeed })}
              {' · '}
              {fmtInterval(a.targetFeedIntervalMs)} target interval
            </p>
          </>
        ) : (
          <p className={styles.empty}>{t('analytics.feeding_empty', { period: 'this period' })}</p>
        )}
      </SectionCard>

      {(a.totalPumpedOzThisWeek > 0 || hasPumpTrend) && (
        <SectionCard icon={<PumpIcon size={14} />} title={t('analytics.pumping')}>
          {a.totalPumpedOzThisWeek > 0 ? (
            <>
              <p
                className={styles.primaryStat}
              >{`${formatExactTotal(a.totalPumpedOzThisWeek)} oz`}</p>
              <div className={styles.statsGrid}>
                <StatRow
                  label={t('analytics.pumped_oz_per_day_label')}
                  value={t('analytics.pumped_per_day_stat', {
                    avg: a.avgPumpedOzPerDay.toFixed(1),
                  })}
                />
                <StatRow
                  label={t('analytics.milk_balance_label')}
                  value={t('analytics.milk_balance_stat', {
                    balance: formatExactTotal(a.lactationBalanceOzThisWeek),
                  })}
                />
              </div>
            </>
          ) : (
            <p className={styles.empty}>
              {t('analytics.pumping_empty', { period: 'this period' })}
            </p>
          )}
        </SectionCard>
      )}

      {hasFeedTrend && (
        <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.feeding_trends')}>
          <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
          <TrendBlock label={t('analytics.oz_per_feed_label')}>
            <TrendSparkline
              data={trend.ozPerFeedByDay}
              benchmarkValue={a.targetOzPerFeed}
              benchmarkLabel={`${t('analytics.target_label')} ${a.targetOzPerFeed} oz`}
              ariaLabel={t('analytics.oz_per_feed_label')}
            />
          </TrendBlock>
          <TrendBlock label={t('analytics.feed_interval_label')}>
            <TrendSparkline
              data={trend.feedIntervalByDay}
              benchmarkValue={trend.targetFeedIntervalMs}
              benchmarkLabel={`${t('analytics.target_label')} ${fmtInterval(trend.targetFeedIntervalMs)}`}
              ariaLabel={t('analytics.feed_interval_label')}
            />
          </TrendBlock>
          <div className={styles.trendAxisRow}>
            {trendDayLabels
              .filter((_, i) => i % 2 === 0)
              .map((label, i) => (
                <span key={i} className={styles.axisLabel}>
                  {label}
                </span>
              ))}
          </div>
        </SectionCard>
      )}

      {hasOzTrend && (
        <SectionCard icon={<BottleIcon size={14} />} title={t('analytics.daily_intake')}>
          <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
          <TrendBlock
            label={t('analytics.oz_per_day_label')}
            sublabel={`${t('analytics.target_label')} ${trend.targetOzPerDay} oz`}
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
              .map((label, i) => (
                <span key={i} className={styles.axisLabel}>
                  {label}
                </span>
              ))}
          </div>
        </SectionCard>
      )}

      {hasWeaningCrossover && (
        <SectionCard icon={<FoodIcon size={14} />} title={t('analytics.weaning_crossover')}>
          <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
          <TrendBlock
            label={t('analytics.weaning_crossover_label')}
            sublabel={t('analytics.weaning_crossover_sublabel')}
          >
            <WeaningCrossoverChart
              data={trend.weaningCrossoverByDay}
              ariaLabel={t('analytics.weaning_crossover')}
            />
          </TrendBlock>
          <div className={styles.crossoverLegend}>
            <span>
              <i className={styles.crossoverBottleKey} />
              {t('analytics.weaning_bottles')}
            </span>
            <span>
              <i className={styles.crossoverSolidsKey} />
              {t('analytics.weaning_solids')}
            </span>
          </div>
          <p className={styles.benchmark}>{t('analytics.weaning_crossover_note')}</p>
          <div className={styles.trendAxisRow}>
            {trendDayLabels
              .filter((_, i) => i % 2 === 0)
              .map((label, i) => (
                <span key={i} className={styles.axisLabel}>
                  {label}
                </span>
              ))}
          </div>
        </SectionCard>
      )}

      {hasPumpTrend && (
        <SectionCard icon={<PumpIcon size={14} />} title={t('analytics.pumping_trends')}>
          <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
          <TrendBlock label={t('analytics.pumped_oz_per_day_label')}>
            <TrendBars
              data={trend.pumpedOzPerDay}
              height={72}
              ariaLabel={t('analytics.pumped_oz_per_day_label')}
            />
          </TrendBlock>
          <TrendBlock label={t('analytics.milk_balance_label')}>
            <TrendSparkline
              data={trend.milkBalanceByDay}
              benchmarkValue={0}
              benchmarkLabel="0"
              ariaLabel={t('analytics.milk_balance_label')}
            />
          </TrendBlock>
          <div className={styles.trendAxisRow}>
            {trendDayLabels
              .filter((_, i) => i % 2 === 0)
              .map((label, i) => (
                <span key={i} className={styles.axisLabel}>
                  {label}
                </span>
              ))}
          </div>
        </SectionCard>
      )}

      {isNewborn ? (
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
                  value={`${formatMs(a.avgDailySleepMs)}/day avg`}
                />
              </div>
            </>
          ) : (
            <p className={styles.empty}>{t('analytics.naps_empty', { period: 'this period' })}</p>
          )}
        </SectionCard>
      ) : (
        <>
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
                      value={`${formatMs(a.avgNapDurationMs)} avg`}
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
                {a.napDeltaVsLastWeek != null && (
                  <div className={styles.deltaRow}>
                    <DeltaPill
                      ms={Math.abs(a.napDeltaVsLastWeek)}
                      positive={a.napDeltaVsLastWeek >= 0}
                    />
                    <span className={styles.deltaLabel}>avg nap vs last week</span>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.empty}>{t('analytics.naps_empty', { period: 'this period' })}</p>
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
                {a.sleepDeltaVsLastWeek != null && (
                  <div className={styles.deltaRow}>
                    <DeltaPill
                      ms={Math.abs(a.sleepDeltaVsLastWeek)}
                      positive={a.sleepDeltaVsLastWeek >= 0}
                    />
                    <span className={styles.deltaLabel}>total sleep vs last week</span>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.empty}>
                {t('analytics.night_sleep_empty', { period: 'this period' })}
              </p>
            )}
          </SectionCard>
        </>
      )}

      {hasSleepTrend && (
        <SectionCard icon={<HotelIcon size={14} />} title={t('analytics.sleep_consolidation')}>
          <p className={styles.trendSubhead}>{t('analytics.last_14_days')}</p>
          <TrendBlock
            label={t('analytics.night_stretch_label')}
            sublabel={`${t('analytics.target_label')} ${formatMs(a.targetDailySleepMs.minMs)}`}
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
              sublabel={`${t('analytics.target_label')} ${trend.targetNapsPerDay} naps`}
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
              .map((label, i) => (
                <span key={i} className={styles.axisLabel}>
                  {label}
                </span>
              ))}
          </div>
        </SectionCard>
      )}

      {signals.length > 0 && (
        <SectionCard icon={<MilestoneIcon size={14} />} title={t('analytics.transition_signals')}>
          {signals.map((signal, idx) => (
            <SignalCard key={idx} signal={signal} />
          ))}
        </SectionCard>
      )}
    </>
  );
}
