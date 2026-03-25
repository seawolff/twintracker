import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Baby, TrackerEvent } from '@tt/core';
import {
  groupEventsByDay,
  eventLabel,
  formatTime,
  formatTimeAgo,
  i18n,
  authorColor,
} from '@tt/core';
import { useThemeContext } from '@tt/core';
import { spacing, fonts } from '../theme/tokens';
import { CloseIcon } from './icons/BabyIcons';

// Four graduated row shades (Clear List aesthetic).
// Direction inverts with theme: night → lighten, day → darken.
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
          style={[styles.emptyAddBtn, { borderColor: theme.border }]}
        >
          <Text style={[styles.emptyAddText, { color: theme.text, fontFamily: fonts.mono }]}>
            Log first event +
          </Text>
        </Pressable>
      </View>
    );
  }

  const groups = groupEventsByDay(events, now, resetHour);
  const overlayRgb = theme.mode === 'night' ? '255,255,255' : '0,0,0';

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
            const babyName = baby?.name ?? '—';
            const label = eventLabel(event);
            const time = formatTime(event.startedAt);
            const timeAgo = formatTimeAgo(event.startedAt, now);
            const alpha = ROW_ALPHAS[idx % ROW_ALPHAS.length];
            const rowOverlay = alpha > 0 ? `rgba(${overlayRgb},${alpha})` : 'transparent';

            return (
              <Pressable
                key={event.id}
                onPress={() => onEdit(event)}
                accessibilityLabel={`Edit ${label} for ${babyName}`}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: theme.border,
                    backgroundColor: pressed ? theme.surface : theme.bg,
                  },
                ]}
              >
                {/* Tinted overlay for graduated shade */}
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: rowOverlay }]}
                  pointerEvents="none"
                />
                {/* Author avatar — always rendered so columns stay aligned */}
                {event.loggedByName ? (
                  <View
                    style={[
                      styles.authorAvatar,
                      { backgroundColor: authorColor(event.loggedByName) },
                    ]}
                  >
                    <Text style={styles.authorInitial}>
                      {event.loggedByName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.authorAvatar} />
                )}
                <View style={styles.rowMain}>
                  <Text style={[styles.babyName, { color: theme.text, fontFamily: fonts.mono }]}>
                    {babyName}
                  </Text>
                  <Text
                    style={[styles.eventLabel, { color: theme.textDim, fontFamily: fonts.mono }]}
                  >
                    {label}
                  </Text>
                  <Text style={[styles.time, { color: theme.textMuted, fontFamily: fonts.mono }]}>
                    {time}
                  </Text>
                  <Text
                    style={[styles.timeAgo, { color: theme.textMuted, fontFamily: fonts.mono }]}
                  >
                    {timeAgo}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onDelete(event.id)}
                  accessibilityLabel={`Delete ${label}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                >
                  <CloseIcon size={16} color={theme.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
    marginRight: 6,
  },
  authorInitial: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
  deleteBtn: {
    width: 44,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
