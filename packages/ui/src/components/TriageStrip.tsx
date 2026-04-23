import { StyleSheet, Text, View } from 'react-native';
import type { BabyInsight } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing } from '../theme/tokens';
import { BottleIcon, MoonIcon, DiaperIcon, NursingIcon } from './icons/BabyIcons';

interface TriageStripProps {
  insight: BabyInsight;
}

const ICON_SIZE = 13;

export function TriageStrip({ insight }: TriageStripProps) {
  const theme = useThemeContext();
  const FeedIcon = insight.feedTriageMode === 'nursing' ? NursingIcon : BottleIcon;

  const feedPred = insight.predictions.find(p => p.type === 'bottle');
  const napPred =
    insight.predictions.find(p => p.type === 'sleep') ??
    insight.predictions.find(p => p.type === 'nap');
  const diaperPred = insight.predictions.find(p => p.type === 'diaper');

  // While actively sleeping, sleep status is always ok (unless past due wake time)
  const sleepUrgency = napPred?.urgency ?? (insight.sleepStatus ? insight.urgency : 'ok');

  const feedColor =
    feedPred?.urgency === 'overdue'
      ? theme.urgencyOverdue
      : feedPred?.urgency === 'soon'
        ? theme.urgencySoon
        : theme.textMuted;
  const sleepColor =
    sleepUrgency === 'overdue'
      ? theme.urgencyOverdue
      : sleepUrgency === 'soon'
        ? theme.urgencySoon
        : theme.textMuted;
  const diaperColor =
    diaperPred?.urgency === 'overdue'
      ? theme.urgencyOverdue
      : diaperPred?.urgency === 'soon'
        ? theme.urgencySoon
        : theme.textMuted;

  const feedHasBottle = insight.totalOzToday > 0;
  const feedHasNursing = insight.totalNursingMinutesToday > 0;

  return (
    <View style={[styles.strip, { borderColor: theme.border, backgroundColor: theme.bg }]}>
      <View style={styles.cell}>
        <FeedIcon size={ICON_SIZE} color={feedColor} />
        {insight.feedCountToday > 0 ? (
          <View style={styles.feedSummary}>
            {feedHasBottle && (
              <Text
                style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
                numberOfLines={1}
              >
                {`${insight.feedCountToday}/${insight.targetFeedsPerDay} · ${insight.totalOzToday}oz`}
              </Text>
            )}
            {feedHasBottle && feedHasNursing && (
              <>
                <Text style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}>
                  {' · '}
                </Text>
                <NursingIcon size={ICON_SIZE} color={feedColor} />
              </>
            )}
            {feedHasNursing && (
              <Text
                style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
                numberOfLines={1}
              >
                {feedHasBottle
                  ? `${insight.totalNursingMinutesToday}m`
                  : `${insight.feedCountToday}/${insight.targetFeedsPerDay} · ${insight.totalNursingMinutesToday}m`}
              </Text>
            )}
            {!feedHasBottle && !feedHasNursing && (
              <Text
                style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
                numberOfLines={1}
              >
                {`${insight.feedCountToday}/${insight.targetFeedsPerDay}`}
              </Text>
            )}
          </View>
        ) : (
          <Text
            style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
            numberOfLines={1}
          >
            {insight.fedAgo ?? '—'}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.cell,
          { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <MoonIcon size={ICON_SIZE} color={sleepColor} />
        <Text
          style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
          numberOfLines={1}
        >
          {insight.sleepStatus ? insight.sleepStatus.replace(/^Active · /, '') : '—'}
        </Text>
      </View>
      <View
        style={[
          styles.cell,
          { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <DiaperIcon size={ICON_SIZE} color={diaperColor} />
        <Text
          style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
          numberOfLines={1}
        >
          {insight.changedAgo ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  value: {
    fontSize: 11,
    flexShrink: 1,
  },
  feedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    overflow: 'hidden',
  },
});
