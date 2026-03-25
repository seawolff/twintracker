import { StyleSheet, Text, View } from 'react-native';
import type { BabyInsight } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts, spacing } from '../theme/tokens';
import { BottleIcon, MoonIcon, DiaperIcon } from './icons/BabyIcons';

interface TriageStripProps {
  insight: BabyInsight;
}

const ICON_SIZE = 13;

export function TriageStrip({ insight }: TriageStripProps) {
  const theme = useThemeContext();

  const feedPred = insight.predictions.find(p => p.type === 'bottle');
  const napPred = insight.predictions.find(p => p.type === 'nap');
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

  return (
    <View style={[styles.strip, { borderColor: theme.border, backgroundColor: theme.bg }]}>
      <View style={styles.cell}>
        <BottleIcon size={ICON_SIZE} color={feedColor} />
        <Text
          style={[styles.value, { color: theme.textDim, fontFamily: fonts.mono }]}
          numberOfLines={1}
        >
          {insight.fedAgo ?? '—'}
        </Text>
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
          {insight.sleepStatus ?? '—'}
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
});
