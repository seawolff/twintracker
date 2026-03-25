import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baby, EventType, LatestEventMap, NapAlarm, TrackerEvent } from '@tt/core';
import {
  getBabyInsight,
  computeLearnedStats,
  useThemeContext,
  i18n,
  formatMs,
  getNapActionType,
} from '@tt/core';
import { spacing, radius, fonts } from '../theme/tokens';
import {
  BottleIcon,
  MoonIcon,
  SunIcon,
  DiaperIcon,
  MoreVertIcon,
  BarChartIcon,
  TimerIcon,
} from './icons/BabyIcons';
import { TriageStrip } from './TriageStrip';
import { NapTimerModal } from './NapTimerModal';
import { FeedPickerModal } from './FeedPickerModal';
import { MoreMenuSheet } from './MoreMenuSheet';
import { TimerPickerModal } from './TimerPickerModal';

interface BabyCardProps {
  baby: Baby;
  latest: LatestEventMap;
  events: TrackerEvent[];
  onLog: (type: EventType, suggestedOz?: number) => void;
  onOpenAnalytics?: (babyId: string) => void;
  now?: Date;
  resetHour?: number;
  bedtimeHour?: number;
  wakeHour?: number;
  sleepTraining?: boolean;
  napCheckMinutes?: number;
  // Alarm props
  activeAlarm?: NapAlarm;
  onSetAlarm?: (durationMs: number, isCustomTimer: boolean) => void;
  onDismissAlarm?: () => void;
  onRescheduleAlarm?: (firesAt: string, durationMs: number) => void;
}

const ICON_SIZE = 16;

function badgeCountdown(firesAt: string): string {
  const ms = Math.max(0, new Date(firesAt).getTime() - Date.now());
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function BabyCard({
  baby,
  latest,
  events,
  onLog,
  onOpenAnalytics,
  now: nowProp,
  resetHour = 0,
  bedtimeHour = 19,
  wakeHour = 7,
  sleepTraining = false,
  napCheckMinutes = 15,
  activeAlarm,
  onSetAlarm,
  onDismissAlarm,
  onRescheduleAlarm,
}: BabyCardProps) {
  const theme = useThemeContext();
  const [now, setNow] = useState(() => nowProp ?? new Date());
  const [feedPickerOpen, setFeedPickerOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [pressedBtn, setPressedBtn] = useState('');
  const [, tick] = useState(0); // 1s re-render for badge countdown

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

  // 1s tick for badge countdown — only runs when an alarm is active
  useEffect(() => {
    if (!activeAlarm) {
      return;
    }
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeAlarm]);

  const babyEvents = useMemo(() => events.filter(e => e.babyId === baby.id), [events, baby.id]);
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
        sleepTraining,
      ),
    [baby, latest, events, now, resetHour, learnedStats, bedtimeHour, wakeHour, sleepTraining],
  );

  const napEvent = latest[`${baby.id}:nap`];
  const sleepEvent = latest[`${baby.id}:sleep`];
  const napIsActive = napEvent != null && !napEvent.endedAt;
  const sleepIsActive = sleepEvent != null && !sleepEvent.endedAt;

  // Active nap/sleep event (for alarm window calculation)
  const activeNapEvent = napIsActive ? napEvent : sleepIsActive ? sleepEvent : null;
  const napAgeMs = activeNapEvent
    ? now.getTime() - new Date(activeNapEvent.startedAt).getTime()
    : 0;
  const windowMs = sleepTraining ? insight.selfSoothingMinutes * 60_000 : napCheckMinutes * 60_000;

  // Show "Set alarm" only while within the check window and no alarm is already active
  const showAlarmButton = !!activeNapEvent && napAgeMs <= windowMs && !activeAlarm && !!onSetAlarm;

  const headlineColor =
    insight.urgency === 'overdue'
      ? theme.urgencyOverdue
      : insight.urgency === 'soon'
        ? theme.urgencySoon
        : theme.textDim;

  const isSleepMode = insight.isNight || insight.isBedtimeStretch;
  const napWaking = napIsActive || sleepIsActive;
  const napActionType: EventType = getNapActionType(napIsActive, sleepIsActive, isSleepMode);
  const napLabel = napWaking
    ? i18n.t('home.action_wake')
    : isSleepMode
      ? i18n.t('log_sheet.types.sleep')
      : i18n.t('log_sheet.types.nap');

  const handleAlarmPress = useCallback(() => {
    if (!onSetAlarm) {
      return;
    }
    const durationMs = sleepTraining
      ? insight.selfSoothingMinutes * 60_000
      : napCheckMinutes * 60_000;
    onSetAlarm(durationMs, false);
  }, [onSetAlarm, sleepTraining, insight.selfSoothingMinutes, napCheckMinutes]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.nameRow}>
          <Text style={[styles.babyName, { color: theme.text, fontFamily: fonts.display }]}>
            {baby.name}
          </Text>
          <View style={styles.nameRowActions}>
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

      {/* ── Alarm badge (active alarm) or Set alarm button ── */}
      {activeAlarm && (
        <Pressable
          onPress={() => setTimerOpen(true)}
          accessibilityLabel={`Nap alarm for ${baby.name} — tap to view`}
          style={[styles.alarmBadge, { borderColor: theme.border }]}
        >
          <View style={styles.alarmBadgeRow}>
            <TimerIcon size={12} color={theme.text} />
            <Text style={[styles.alarmBadgeText, { color: theme.text, fontFamily: fonts.mono }]}>
              {badgeCountdown(activeAlarm.firesAt)}
            </Text>
          </View>
        </Pressable>
      )}

      {showAlarmButton && (
        <Pressable
          onPress={handleAlarmPress}
          accessibilityLabel={`Set alarm for ${baby.name}`}
          style={[styles.alarmBadge, { borderColor: theme.border }]}
        >
          <Text style={[styles.alarmBadgeText, { color: theme.textDim, fontFamily: fonts.mono }]}>
            {i18n.t('home.action_set_alarm')}
          </Text>
        </Pressable>
      )}

      {/* ── Predictions ── */}
      {insight.predictions.length > 0 && (
        <View style={styles.predictionsRow}>
          {insight.predictions.map(p => {
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
                : p.type === 'diaper'
                  ? due
                    ? i18n.t('home.pred_change_due')
                    : i18n.t('home.pred_change_in', { time: formatMs(p.remainingMs) })
                  : due
                    ? i18n.t('home.pred_nap_due')
                    : i18n.t('home.pred_nap_in', { time: formatMs(p.remainingMs) });
            // Bottle and diaper predictions are irrelevant while baby is sleeping — dim them.
            const chipDimmed = napWaking && (p.type === 'bottle' || p.type === 'diaper');
            return (
              <View
                key={p.type}
                style={[styles.chip, { borderColor: color }, chipDimmed && styles.dimmed]}
              >
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
        showTimer={!!onSetAlarm}
        onLog={type => onLog(type)}
        onOpenTimer={() => setTimerPickerOpen(true)}
        onClose={() => setMoreOpen(false)}
      />

      {/* ── Custom timer picker ── */}
      {onSetAlarm && (
        <TimerPickerModal
          visible={timerPickerOpen}
          babyName={baby.name}
          onSetAlarm={ms => {
            setTimerPickerOpen(false);
            onSetAlarm(ms, true);
          }}
          onClose={() => setTimerPickerOpen(false)}
        />
      )}

      {/* ── Full-screen timer modal ── */}
      {activeAlarm && (
        <NapTimerModal
          alarm={activeAlarm}
          visible={timerOpen}
          onDismiss={() => setTimerOpen(false)}
          onCancel={() => {
            setTimerOpen(false);
            onDismissAlarm?.();
          }}
          onReschedule={(firesAt, durationMs) => {
            onRescheduleAlarm?.(firesAt, durationMs);
          }}
        />
      )}
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
});
