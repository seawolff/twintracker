/** Web history feed: scroll-windowed grouped event list with undo-delete snackbar. */
import PropTypes from 'prop-types';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Baby, TrackerEvent } from '@tt/core';
import {
  groupEventsByDay,
  eventLabel,
  formatDuration,
  formatEventTime,
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
/** Preload more groups when the sentinel is within this many px of the viewport edge. */
const INTERSECTION_ROOT_MARGIN = '400px';

// Inject section-header CSS once at module load (web-only file).
// Adjacent-sibling selector targets every header after the first: removes the top margin
// (which only the first header needs) and adds the layered drop shadow.
if (typeof document !== 'undefined') {
  const STYLE_ID = 'tt-history-section-styles';
  if (!document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = [
      '.tt-section-header + .tt-section-header { margin-top: 0 !important; box-shadow: rgba(0, 0, 0, 0.09) 0px -4px 6px; }',
      // Snackbar: fixed at the top of the viewport; shifts right of sidebar on desktop.
      '.tt-undo-snackbar { position: fixed; top: 12px; left: 12px; right: 12px; z-index: 200; }',
      '@media (min-width: 768px) { .tt-undo-snackbar { left: 72px; } }',
    ].join('\n');
    document.head.appendChild(el);
  }
}

/** View extended with `className` for CSS selector targeting (web-only file). */
const ClassView = View as React.ComponentType<ComponentProps<typeof View> & { className?: string }>;

interface HistoryFeedProps {
  events: TrackerEvent[];
  babies: Baby[];
  resetHour?: number;
  now?: Date;
  onDelete: (id: string) => void;
  /** Called when the user taps Undo — re-creates the just-deleted event. */
  onRestore?: (event: TrackerEvent) => void;
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
  onRestore,
  onEdit,
  onAddForDay,
  onRefresh,
}: HistoryFeedProps) {
  const theme = useThemeContext();
  const [now, setNow] = useState(() => nowProp ?? new Date());
  const [refreshing, setRefreshing] = useState(false);
  // Render 5 day-groups initially (~2-3 days of twin logs); auto-expands as user scrolls.
  const [visibleGroups, setVisibleGroups] = useState(INITIAL_VISIBLE_GROUPS);
  // undo-delete: onDelete fires immediately (safe on hard refresh); snackbar shows for
  // UNDO_MS to let the user undo via onRestore (re-creates the event via logEvent).
  const UNDO_MS = 4_000;
  const [undoPending, setUndoPending] = useState<{ event: TrackerEvent } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // On unmount, just cancel the snackbar timer — the delete already fired immediately.
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  function handleDeleteTap(event: TrackerEvent) {
    // Cancel any prior snackbar before starting a new one.
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    // Fire the delete immediately — safe even if the user hard-refreshes.
    onDelete(event.id);
    setUndoPending({ event });
    undoTimerRef.current = setTimeout(() => {
      setUndoPending(null);
      undoTimerRef.current = null;
    }, UNDO_MS);
  }

  function handleUndo() {
    if (!undoTimerRef.current || !undoPending) {
      return;
    }
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    onRestore?.(undoPending.event);
    setUndoPending(null);
  }

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

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleGroups(v => v + 5);
        }
      },
      { rootMargin: INTERSECTION_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleGroups]);

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: fonts.mono }]}>
          {i18n.t('history.no_events')}
        </Text>
        <Pressable
          onPress={() => onAddForDay(now)}
          accessibilityLabel={i18n.t('history.log_first_event')}
          style={[styles.emptyAddBtn, { borderColor: theme.border }]}
        >
          <Text style={[styles.emptyAddText, { color: theme.text, fontFamily: fonts.mono }]}>
            {i18n.t('history.log_first_event')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const groups = groupEventsByDay(events, now, resetHour);
  const visibleSlice = groups.slice(0, visibleGroups);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
            {/* Section header — CSS adjacent-sibling selector removes top margin and adds drop shadow on all but the first */}
            <ClassView
              className="tt-section-header"
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
                accessibilityLabel={i18n.t('history.add_event_for', { day: group.label })}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.addBtnText, { color: theme.text, fontFamily: fonts.mono }]}>
                  +
                </Text>
              </Pressable>
            </ClassView>

            {/* Event rows */}
            {group.events.map((event, idx) => {
              const baby = getBaby(babies, event.babyId);
              const babyName = baby?.name ?? '—';
              const label = eventLabel(event);
              // For nap/sleep with a known duration, split the label so the duration
              // renders at a smaller font size — long durations like "11h 35m" no longer
              // truncate the type name on narrow screens.
              const durationDetail =
                (event.type === 'nap' || event.type === 'sleep') && event.endedAt
                  ? ` (${formatDuration(event.startedAt, event.endedAt)})`
                  : null;
              const labelBase = durationDetail ? label.replace(durationDetail, '') : label;
              const displayTime = formatEventTime(event.startedAt, now);
              // Infinite smooth greyscale gradient: alpha grows with row index, direction
              // inverts per theme — night bg (black) lightens, day bg (white) darkens.
              const alpha = idx * SHADE_PER_ROW;
              // Solid hex background (not rgba) so contrast is unambiguous for both modes.
              const rowBg = rowBgHex(alpha, theme.mode);
              const textColor = theme.text;

              return (
                <Pressable
                  key={event.id}
                  onPress={() => onEdit(event)}
                  accessibilityLabel={i18n.t('history.edit_event', { label, baby: babyName })}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderBottomColor: theme.border,
                      backgroundColor: pressed ? theme.surface : rowBg,
                    },
                  ]}
                >
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
                    <Text style={[styles.babyName, { color: textColor, fontFamily: fonts.mono }]}>
                      {babyName}
                    </Text>
                    <Text
                      style={[styles.eventLabel, { color: textColor, fontFamily: fonts.mono }]}
                      numberOfLines={1}
                    >
                      {labelBase}
                      {durationDetail ? (
                        <Text style={styles.durationDetail}>{durationDetail}</Text>
                      ) : null}
                    </Text>
                    <Text style={[styles.time, { color: textColor, fontFamily: fonts.mono }]}>
                      {displayTime}
                    </Text>
                  </View>
                  <Pressable
                    onPress={e => {
                      e.stopPropagation();
                      handleDeleteTap(event);
                    }}
                    accessibilityLabel={i18n.t('history.delete_event', { label })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                  >
                    <CloseIcon size={16} color={textColor} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        ))}
        {visibleGroups < groups.length && (
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — web-only sentinel div inside RN ScrollView
          <div ref={sentinelRef} style={{ height: 1 }} />
        )}
      </ScrollView>

      {/* undo snackbar — fixed above the tab bar, auto-commits after UNDO_MS */}
      {undoPending && (
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — web-only fixed div; RN View cannot do position:fixed
        <div
          className="tt-undo-snackbar"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.surface,
            boxShadow: '0 2px 12px rgba(0,0,0,0.14)',
          }}
        >
          <span style={{ fontFamily: fonts.mono, fontSize: 14, color: theme.text }}>
            {i18n.t('history.event_deleted')}
          </span>
          <button
            onClick={handleUndo}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              paddingLeft: 24,
              fontFamily: fonts.mono,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: theme.text,
            }}
          >
            {i18n.t('common.undo')}
          </button>
        </div>
      )}
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
  onRestore: PropTypes.func,
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
  durationDetail: {
    fontSize: 12,
  },
  container: {
    flex: 1,
  },
});
