import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { Baby, TrackerEvent } from '@tt/core';
import {
  groupEventsByDay,
  eventLabel,
  formatTime,
  formatTimeAgo,
  useTranslation,
  i18n,
  authorColor,
} from '@tt/core';
import { useThemeContext } from '@tt/core';
import { spacing, fonts } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';

// Four graduated row shades (Clear List aesthetic) — white alpha overlaid on bg.
// Row index cycles through these so the list feels textured and interactive.
const ROW_ALPHAS = [0, 0.06, 0.1, 0.07];

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
  time: string;
  timeAgo: string;
  rowIndex: number;
  onDelete: (id: string) => void;
  onEdit: (event: TrackerEvent) => void;
  loggedByName?: string;
}

function SwipeRow({
  event,
  babyName,
  label,
  time,
  timeAgo,
  rowIndex,
  onDelete,
  onEdit,
  loggedByName,
}: SwipeRowProps) {
  const theme = useThemeContext();
  const { t } = useTranslation();
  const swipeRef = useRef<Swipeable>(null);

  // Graduated shade: overlay direction inverts with theme.
  // Night (black bg) → lighten with white alpha. Day (white bg) → darken with black alpha.
  const alpha = ROW_ALPHAS[rowIndex % ROW_ALPHAS.length];
  const overlayRgb = theme.mode === 'night' ? '255,255,255' : '0,0,0';
  const rowOverlay = alpha > 0 ? `rgba(${overlayRgb},${alpha})` : 'transparent';

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
          accessibilityLabel={`Delete ${label}`}
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
        accessibilityLabel={`Edit ${label} for ${babyName}`}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: theme.border, backgroundColor: pressed ? theme.surface : theme.bg },
        ]}
      >
        {/* Tinted overlay for graduated shade */}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: rowOverlay }]}
          pointerEvents="none"
        />
        {/* Author avatar — always rendered so columns stay aligned */}
        {loggedByName ? (
          <View style={[styles.authorAvatar, { backgroundColor: authorColor(loggedByName) }]}>
            <Text style={styles.authorInitial}>{loggedByName.charAt(0).toUpperCase()}</Text>
          </View>
        ) : (
          <View style={styles.authorAvatar} />
        )}
        <Text style={[styles.babyName, { color: theme.text, fontFamily: fonts.mono }]}>
          {babyName}
        </Text>
        <Text style={[styles.eventLabel, { color: theme.textDim, fontFamily: fonts.mono }]}>
          {label}
        </Text>
        <Text style={[styles.time, { color: theme.textMuted, fontFamily: fonts.mono }]}>
          {time}
        </Text>
        <Text style={[styles.timeAgo, { color: theme.textMuted, fontFamily: fonts.mono }]}>
          {timeAgo}
        </Text>
        {/* Swipe hint chevron */}
        <Text style={[styles.swipeHint, { color: theme.textMuted }]}>›</Text>
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
  // Render 5 day-groups initially (~2-3 days of twin logs); auto-expands as user scrolls.
  const [visibleGroups, setVisibleGroups] = useState(5);

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
          accessibilityLabel="Log first event"
          style={({ pressed }) => [
            styles.emptyAddBtn,
            { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.emptyAddText, { color: theme.text, fontFamily: fonts.mono }]}>
            Log first event +
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
    if (remaining < 400) {
      setVisibleGroups(v => (v < groups.length ? v + 5 : v));
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
            />
          ) : undefined
        }
      >
        {visibleSlice.map((group: { date: Date; label: string; events: TrackerEvent[] }) => (
          <View key={group.date.getTime()}>
            {/* Section header */}
            <View
              style={[
                styles.sectionHeader,
                { backgroundColor: theme.bg, borderBottomColor: theme.border },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: fonts.mono }]}>
                {group.label.toUpperCase()}
              </Text>
              <Pressable
                onPress={() => onAddForDay(group.date)}
                accessibilityLabel={`Add event for ${group.label}`}
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
              return (
                <SwipeRow
                  key={event.id}
                  event={event}
                  babyName={baby?.name ?? '—'}
                  label={eventLabel(event)}
                  time={formatTime(event.startedAt)}
                  timeAgo={formatTimeAgo(event.startedAt, now)}
                  rowIndex={idx}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  loggedByName={event.loggedByName}
                />
              );
            })}
          </View>
        ))}
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
  time: {
    fontSize: 14,
  },
  timeAgo: {
    fontSize: 13,
    minWidth: 64,
    textAlign: 'right',
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
