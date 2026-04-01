/** Native history feed: scroll-windowed grouped event list with swipe-to-delete rows. */
import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { Baby, TrackerEvent } from '@tt/core';
import {
  groupEventsByDay,
  eventLabel,
  formatDuration,
  formatEventTime,
  useTranslation,
  i18n,
  authorColor,
} from '@tt/core';
import { useThemeContext } from '@tt/core';
import { spacing, fonts } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';
import { rowBgHex } from '../rowTextColor';

/**
 * Alpha increment per row within a group — produces a smooth, infinite greyscale gradient (Clear app style).
 * Kept low so typical twin-tracker day groups (20-30 rows) stay in the pure-color zone where
 * black/white text has strong contrast; the text transition only kicks in for unusually long groups.
 */
const SHADE_PER_ROW = 0.015;
/** Initial number of day-groups rendered before the user scrolls (~2-3 days of twin logs). */
const INITIAL_VISIBLE_GROUPS = 5;
/** Load more groups when scroll position is within this many px of the bottom. */
const SCROLL_LOAD_THRESHOLD_PX = 400;

interface HistoryFeedProps {
  events: TrackerEvent[];
  babies: Baby[];
  resetHour?: number;
  now?: Date;
  onDelete: (id: string) => void;
  onEdit: (event: TrackerEvent) => void;
  onAddForDay: (date: Date) => void;
  onRefresh?: () => Promise<void>;
}

function getBaby(babies: Baby[], babyId: string): Baby | undefined {
  return babies.find(b => b.id === babyId);
}

interface SwipeRowProps {
  event: TrackerEvent;
  babyName: string;
  label: string;
  /** Parenthetical duration for nap/sleep rows, rendered smaller so long values don't truncate. */
  durationDetail?: string;
  displayTime: string;
  rowIndex: number;
  onDelete: (id: string) => void;
  onEdit: (event: TrackerEvent) => void;
  loggedByName?: string;
}

function SwipeRow({
  event,
  babyName,
  label,
  durationDetail,
  displayTime,
  rowIndex,
  onDelete,
  onEdit,
  loggedByName,
}: SwipeRowProps) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const swipeRef = useRef<Swipeable>(null);

  // Infinite smooth greyscale gradient: alpha grows with row index per group.
  // Solid hex background (not rgba) so contrast is unambiguous for both modes.
  const alpha = rowIndex * SHADE_PER_ROW;
  const rowBg = rowBgHex(alpha, theme.mode);

  const textColor = theme.text;

  // Delete zone: needs enough contrast against both day (#fff) and night (#000) bg.
  const deleteBg = theme.mode === 'night' ? '#2a2a2a' : '#111111';
  const deleteBgPressed = theme.mode === 'night' ? '#444444' : '#333333';

  function renderRightActions() {
    // Swipe reveals delete zone — user must tap ✕ to confirm.
    // Swipeable handles the reveal slide; we use a static View (animated width
    // is not supported by the native driver).
    return (
      <View style={[styles.deleteAction, { backgroundColor: deleteBg }]}>
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            onDelete(event.id);
          }}
          accessibilityLabel={t('history.delete_event', { label })}
          style={({ pressed }) => [
            styles.deleteActionInner,
            pressed && { backgroundColor: deleteBgPressed },
          ]}
        >
          <CloseIcon size={18} color="#ffffff" />
          <Text style={styles.deleteActionHint}>{t('common.delete')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      <Pressable
        onPress={() => onEdit(event)}
        accessibilityLabel={t('history.edit_event', { label, baby: babyName })}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: theme.border, backgroundColor: pressed ? theme.surface : rowBg },
        ]}
      >
        {/* Author avatar — always rendered so columns stay aligned */}
        {loggedByName ? (
          <View style={[styles.authorAvatar, { backgroundColor: authorColor(loggedByName) }]}>
            <Text style={styles.authorInitial}>{loggedByName.charAt(0).toUpperCase()}</Text>
          </View>
        ) : (
          <View style={styles.authorAvatar} />
        )}
        <Text style={[styles.babyName, { color: textColor, fontFamily: fonts.mono }]}>
          {babyName}
        </Text>
        <Text
          style={[styles.eventLabel, { color: textColor, fontFamily: fonts.mono }]}
          numberOfLines={1}
        >
          {label}
          {durationDetail ? <Text style={styles.durationDetail}>{durationDetail}</Text> : null}
        </Text>
        <Text style={[styles.time, { color: textColor, fontFamily: fonts.mono }]}>
          {displayTime}
        </Text>
        {/* Swipe hint chevron */}
        <Text style={[styles.swipeHint, { color: textColor }]}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

export function HistoryFeed({
  events,
  babies,
  resetHour = 0,
  now: nowProp,
  onDelete,
  onEdit,
  onAddForDay,
  onRefresh,
}: HistoryFeedProps) {
  const theme = useThemeContext();
  const [now, setNow] = useState(() => nowProp ?? new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState(INITIAL_VISIBLE_GROUPS);

  function handleRefresh() {
    if (!onRefresh) {
      return;
    }
    setRefreshing(true);
    onRefresh().finally(() => setRefreshing(false));
  }

  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
      return;
    }
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [nowProp]);

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: fonts.mono }]}>
          {i18n.t('history.no_events')}
        </Text>
        <Pressable
          onPress={() => onAddForDay(now)}
          accessibilityLabel={i18n.t('history.log_first_event')}
          style={({ pressed }) => [
            styles.emptyAddBtn,
            { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.emptyAddText, { color: theme.text, fontFamily: fonts.mono }]}>
            {i18n.t('history.log_first_event')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const groups = groupEventsByDay(events, now, resetHour);

  function handleScroll(e: {
    nativeEvent: {
      layoutMeasurement: { height: number };
      contentOffset: { y: number };
      contentSize: { height: number };
    };
  }) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentSize.height <= 0) {
      return;
    }
    const remaining = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (remaining < SCROLL_LOAD_THRESHOLD_PX) {
      setVisibleGroups(v => (v < groups.length ? v + INITIAL_VISIBLE_GROUPS : v));
    }
  }

  const visibleSlice = groups.slice(0, visibleGroups);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        scrollEventThrottle={200}
        onScroll={handleScroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
              progressBackgroundColor={theme.bg}
            />
          ) : undefined
        }
      >
        {visibleSlice.map(
          (group: { date: Date; label: string; events: TrackerEvent[] }, groupIdx) => (
            <View key={group.date.getTime()}>
              {/* Section header — top shadow on all but the first group creates a layered look */}
              <View
                style={[
                  styles.sectionHeader,
                  { backgroundColor: theme.bg, borderBottomColor: theme.border },
                  groupIdx > 0 && styles.sectionHeaderShadow,
                ]}
              >
                <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: fonts.mono }]}>
                  {group.label.toUpperCase()}
                </Text>
                <Pressable
                  onPress={() => onAddForDay(group.date)}
                  accessibilityLabel={i18n.t('history.add_event_for', { day: group.label })}
                  style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.addBtnText, { color: theme.text, fontFamily: fonts.mono }]}>
                    +
                  </Text>
                </Pressable>
              </View>

              {/* Event rows */}
              {group.events.map((event, idx) => {
                const baby = getBaby(babies, event.babyId);
                const label = eventLabel(event);
                // Render duration in smaller text so long values like "(11h 35m)" don't truncate.
                const durationDetail =
                  (event.type === 'nap' || event.type === 'sleep') && event.endedAt
                    ? ` (${formatDuration(event.startedAt, event.endedAt)})`
                    : undefined;
                const labelBase = durationDetail ? label.replace(durationDetail, '') : label;
                return (
                  <SwipeRow
                    key={event.id}
                    event={event}
                    babyName={baby?.name ?? '—'}
                    label={labelBase}
                    durationDetail={durationDetail}
                    displayTime={formatEventTime(event.startedAt, now)}
                    rowIndex={idx}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    loggedByName={event.loggedByName}
                  />
                );
              })}
            </View>
          ),
        )}
      </ScrollView>
    </View>
  );
}

HistoryFeed.propTypes = {
  events: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      babyId: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      startedAt: PropTypes.string.isRequired,
    }).isRequired,
  ).isRequired,
  babies: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      color: PropTypes.string.isRequired,
    }).isRequired,
  ).isRequired,
  resetHour: PropTypes.number,
  onDelete: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onAddForDay: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: spacing.md,
  },
  emptyAddBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
  sectionHeaderShadow: {
    marginTop: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.09,
    shadowRadius: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  addBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  babyName: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 64,
  },
  eventLabel: {
    fontSize: 16,
    flex: 1,
  },
  durationDetail: {
    fontSize: 12,
  },
  time: {
    fontSize: 14,
    flexShrink: 0,
  },
  authorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInitial: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
  swipeHint: {
    fontSize: 18,
    marginLeft: 2,
    opacity: 0.4,
  },
  deleteAction: {
    width: 90,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  deleteActionInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteActionHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
