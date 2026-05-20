import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baby, EventType, LatestEventMap, TimeFormat, TrackerEvent } from '@tt/core';
import {
  getBabyInsight,
  computeLearnedStats,
  useThemeContext,
  i18n,
  formatMs,
  getNapActionType,
  getAgeWeeks,
} from '@tt/core';
import { spacing, radius, fonts } from '../theme/tokens';
import {
  BottleIcon,
  MoonIcon,
  SunIcon,
  DiaperIcon,
  MoreVertIcon,
  BarChartIcon,
  PersonIcon,
} from './icons/BabyIcons';
import { TriageStrip } from './TriageStrip';
import { FeedPickerModal } from './FeedPickerModal';
import { MoreMenuSheet } from './MoreMenuSheet';
import { SleepTrainingInfoSheet } from './SleepTrainingInfoSheet';
import { babyColorHex } from '../babyColors';

interface BabyCardProps {
  baby: Baby;
  latest: LatestEventMap;
  events: TrackerEvent[];
  onLog: (type: EventType, suggestedOz?: number) => void;
  onOpenAnalytics?: (babyId: string) => void;
  onOpenProfile?: () => void;
  now?: Date;
  resetHour?: number;
  bedtimeHour?: number;
  wakeHour?: number;
  timeFormat?: TimeFormat;
  sleepTraining?: boolean;
  napCheckMinutes?: number;
  // True when the household theme has been forced into night mode by a real sleep event.
  householdNightMode?: boolean;
}

const ICON_SIZE = 16;

export function BabyCard({
  baby,
  latest,
  events,
  onLog,
  onOpenAnalytics,
  onOpenProfile,
  now: nowProp,
  resetHour = 0,
  bedtimeHour = 19,
  wakeHour = 7,
  timeFormat = '12h',
  sleepTraining = false,
  householdNightMode = false,
}: BabyCardProps) {
  const theme = useThemeContext();
  const [now, setNow] = useState(() => nowProp ?? new Date());
  const [feedPickerOpen, setFeedPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sleepTrainingInfoOpen, setSleepTrainingInfoOpen] = useState(false);
  const [pressedBtn, setPressedBtn] = useState('');

  useEffect(() => {
    if (nowProp) {
      return;
    }
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, [nowProp]);

  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
    }
  }, [nowProp]);

  const babyEvents = useMemo(() => events.filter(e => e.babyId === baby.id), [events, baby.id]);
  const ageWeeks = useMemo(() => getAgeWeeks(baby.birthDate), [baby.birthDate]);
  const learnedStats = useMemo(() => computeLearnedStats(babyEvents, now), [babyEvents, now]);
  const insight = useMemo(
    () =>
      getBabyInsight(
        baby,
        latest,
        events,
        now,
        resetHour,
        learnedStats,
        bedtimeHour,
        wakeHour,
        timeFormat,
      ),
    [baby, latest, events, now, resetHour, learnedStats, bedtimeHour, wakeHour, timeFormat],
  );

  const napEvent = latest[`${baby.id}:nap`];
  const sleepEvent = latest[`${baby.id}:sleep`];
  const napIsActive = napEvent != null && !napEvent.endedAt;
  const sleepIsActive = sleepEvent != null && !sleepEvent.endedAt;

  const headlineColor =
    insight.urgency === 'overdue'
      ? theme.urgencyOverdue
      : insight.urgency === 'soon'
        ? theme.urgencySoon
        : theme.textDim;

  // Stage 1 newborns have no circadian rhythm — every sleep logs as 'sleep' type, not 'nap'.
  const isSleepMode = insight.isNight || insight.isBedtimeStretch || insight.scheduleStage === 1;
  const napWaking = napIsActive || sleepIsActive;
  const napActionType: EventType = getNapActionType(napIsActive, sleepIsActive, isSleepMode);
  // Stage 1 shows "Nap" label (same as daytime Stage 2) — logs as 'sleep' type behind the scenes.
  // Night mode and bedtime stretch show "Sleep" label; Stage 1 does not.
  // Also show "Sleep" when the household is currently in night mode because a real sleep event
  // flipped the theme before the configured bedtime. Guard against napWaking so we don't relabel
  // an actively sleeping baby.
  const isSleepLabel =
    insight.isNight || insight.isBedtimeStretch || (householdNightMode && !napWaking);
  const napLabel = napWaking
    ? i18n.t('home.action_wake')
    : isSleepLabel
      ? i18n.t('log_sheet.types.sleep')
      : i18n.t('log_sheet.types.nap');

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.nameRow}>
          <View style={[styles.babyColorDot, { backgroundColor: babyColorHex(baby.color) }]} />
          <Text style={[styles.babyName, { color: theme.text, fontFamily: fonts.display }]}>
            {baby.name}
          </Text>
          <View style={styles.nameRowActions}>
            {onOpenProfile && (
              <Pressable
                onPress={onOpenProfile}
                onPressIn={() => setPressedBtn('profile')}
                onPressOut={() => setPressedBtn('')}
                accessibilityLabel={i18n.t('baby_profile.edit_profile', { name: baby.name })}
                style={styles.iconBtn}
              >
                {pressedBtn === 'profile' && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      styles.stateLayer,
                      { backgroundColor: theme.text },
                    ]}
                    pointerEvents="none"
                  />
                )}
                <PersonIcon size={ICON_SIZE} color={theme.textDim} />
              </Pressable>
            )}
            {onOpenAnalytics && (
              <Pressable
                onPress={() => onOpenAnalytics(baby.id)}
                onPressIn={() => setPressedBtn('analytics')}
                onPressOut={() => setPressedBtn('')}
                accessibilityLabel={`Analytics for ${baby.name}`}
                style={styles.iconBtn}
              >
                {pressedBtn === 'analytics' && (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      styles.stateLayer,
                      { backgroundColor: theme.text },
                    ]}
                    pointerEvents="none"
                  />
                )}
                <BarChartIcon size={ICON_SIZE} color={theme.textDim} />
              </Pressable>
            )}
            <Pressable
              onPress={() => setMoreOpen(true)}
              onPressIn={() => setPressedBtn('more')}
              onPressOut={() => setPressedBtn('')}
              accessibilityLabel={`More options for ${baby.name}`}
              style={styles.iconBtn}
            >
              {pressedBtn === 'more' && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    styles.stateLayer,
                    { backgroundColor: theme.text },
                  ]}
                  pointerEvents="none"
                />
              )}
              <MoreVertIcon size={ICON_SIZE} color={theme.textDim} />
            </Pressable>
          </View>
        </View>
        <Text
          style={[styles.headline, { color: headlineColor, fontFamily: fonts.mono }]}
          numberOfLines={1}
        >
          {insight.headline}
        </Text>
      </View>

      {/* ── Narrative ── */}
      <View style={styles.narrativeContainer}>
        <Text style={[styles.narrative, { color: theme.text }]}>{insight.narrative}</Text>
      </View>

      {/* ── Sleep training badge — shown while nap/sleep is active ── */}
      {sleepTraining && napWaking && (
        <Pressable
          onPress={() => setSleepTrainingInfoOpen(true)}
          accessibilityLabel={`Sleep training information for ${baby.name}`}
          accessibilityRole="button"
          style={[styles.sleepTrainingBadge, { borderColor: theme.border }]}
        >
          <Text
            style={[styles.sleepTrainingText, { color: theme.textDim, fontFamily: fonts.mono }]}
          >
            {i18n.t('settings.sleep_training_wait', { minutes: insight.selfSoothingMinutes })}
          </Text>
        </Pressable>
      )}

      {/* ── Predictions — bottle and diaper hidden during sleep ── */}
      {insight.predictions.length > 0 && (
        <View style={styles.predictionsRow}>
          {insight.predictions.map(p => {
            // Hide bottle and diaper predictions entirely while baby is sleeping
            if (napWaking && (p.type === 'bottle' || p.type === 'diaper')) {
              return null;
            }
            const color: string =
              p.urgency === 'overdue'
                ? theme.urgencyOverdue
                : p.urgency === 'soon'
                  ? theme.urgencySoon
                  : theme.textDim;
            const due = p.remainingMs <= 0;
            const label =
              p.type === 'bottle'
                ? due
                  ? i18n.t('home.pred_bottle_due')
                  : i18n.t('home.pred_bottle_in', { time: formatMs(p.remainingMs) })
                : p.type === 'sleep'
                  ? due
                    ? i18n.t('home.pred_sleep_due')
                    : i18n.t('home.pred_sleep_in', { time: formatMs(p.remainingMs) })
                  : p.type === 'diaper'
                    ? due
                      ? i18n.t('home.pred_change_due')
                      : i18n.t('home.pred_change_in', { time: formatMs(p.remainingMs) })
                    : due
                      ? i18n.t('home.pred_nap_due')
                      : i18n.t('home.pred_nap_in', { time: formatMs(p.remainingMs) });
            return (
              <View key={p.type} style={[styles.chip, { borderColor: color }]}>
                <Text
                  style={[styles.chipText, { color, fontFamily: fonts.mono }]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Triage strip ── */}
      <TriageStrip insight={insight} />

      {/* ── Action row ── */}
      <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
        <Pressable
          onPress={() => setFeedPickerOpen(true)}
          onPressIn={() => setPressedBtn('feed')}
          onPressOut={() => setPressedBtn('')}
          accessibilityLabel={`Feed ${baby.name}`}
          style={[styles.actionBtn, napWaking && styles.dimmed]}
          disabled={napWaking}
        >
          {pressedBtn === 'feed' && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                styles.stateLayer,
                { backgroundColor: theme.text },
              ]}
              pointerEvents="none"
            />
          )}
          <BottleIcon size={ICON_SIZE} color={theme.accent} />
          <Text style={[styles.actionBtnText, { color: theme.accent, fontFamily: fonts.mono }]}>
            {i18n.t('home.action_feed')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onLog(napActionType)}
          onPressIn={() => setPressedBtn('nap')}
          onPressOut={() => setPressedBtn('')}
          accessibilityLabel={`${napLabel} for ${baby.name}`}
          style={[
            styles.actionBtn,
            { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth },
          ]}
        >
          {pressedBtn === 'nap' && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                styles.stateLayer,
                { backgroundColor: theme.text },
              ]}
              pointerEvents="none"
            />
          )}
          {napWaking ? (
            <SunIcon size={ICON_SIZE} color={theme.accent} />
          ) : (
            <MoonIcon size={ICON_SIZE} color={theme.accent} />
          )}
          <Text style={[styles.actionBtnText, { color: theme.accent, fontFamily: fonts.mono }]}>
            {napLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onLog('diaper')}
          onPressIn={() => setPressedBtn('diaper')}
          onPressOut={() => setPressedBtn('')}
          accessibilityLabel={`Diaper for ${baby.name}`}
          style={[
            styles.actionBtn,
            { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth },
            napWaking && styles.dimmed,
          ]}
          disabled={napWaking}
        >
          {pressedBtn === 'diaper' && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                styles.stateLayer,
                { backgroundColor: theme.text },
              ]}
              pointerEvents="none"
            />
          )}
          <DiaperIcon size={ICON_SIZE} color={theme.accent} />
          <Text style={[styles.actionBtnText, { color: theme.accent, fontFamily: fonts.mono }]}>
            {i18n.t('log_sheet.types.diaper')}
          </Text>
        </Pressable>
      </View>

      {/* ── Feed picker modal ── */}
      <FeedPickerModal
        visible={feedPickerOpen}
        babyName={baby.name}
        suggestedOz={insight.suggestedOz}
        onSelect={(type, oz) => {
          setFeedPickerOpen(false);
          onLog(type, oz);
        }}
        onClose={() => setFeedPickerOpen(false)}
      />

      {/* ── More menu sheet ── */}
      <MoreMenuSheet
        visible={moreOpen}
        babyName={baby.name}
        onLog={type => onLog(type)}
        onClose={() => setMoreOpen(false)}
      />

      <SleepTrainingInfoSheet
        visible={sleepTrainingInfoOpen}
        babyName={baby.name}
        scheduleStage={insight.scheduleStage}
        ageWeeks={ageWeeks}
        onClose={() => setSleepTrainingInfoOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 2,
  },
  babyName: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  babyColorDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  iconBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  headline: {
    fontSize: 12,
  },
  narrativeContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  narrative: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'System',
  },
  alarmBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alarmBadge: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  alarmBadgeText: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 52,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  stateLayer: {
    opacity: 0.08,
  },
  actionBtnText: {
    fontSize: 14,
  },
  predictionsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    overflow: 'hidden',
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    height: 32,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
  },
  dimmed: {
    opacity: 0.35,
  },
  sleepTrainingBadge: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  sleepTrainingText: {
    fontSize: 11,
  },
});
