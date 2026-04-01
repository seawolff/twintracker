'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  configure,
  useAuth,
  useEventStore,
  usePreferences,
  api,
  applyHistoryFilters,
  emptyFilters,
  isFilterActive,
  i18n,
  EVENT_TYPES,
} from '@tt/core';
import type { Baby, EventType, HistoryFilters, LogEventPayload, TrackerEvent } from '@tt/core';
import { FilterIcon, HistoryFeed, LogSheet } from '@tt/ui';
import { BottomTabBar } from '../../components/BottomTabBar';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';
import styles from './history.module.scss';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';

configure('');

interface QuickAdd {
  date: Date;
  baby: Baby | null;
  type: EventType | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    events,
    loading: eventsLoading,
    deleteEvent,
    editEvent,
    logEvent,
    poll,
  } = useEventStore(!authLoading && isAuthenticated);
  const { prefs } = usePreferences();
  const showSkeleton = useDelayedLoading(authLoading || eventsLoading);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [editingEvent, setEditingEvent] = useState<TrackerEvent | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters());
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }
    api.babies.list().then(setBabies).catch(console.error);
  }, [authLoading, isAuthenticated]);

  // Derive unique authors from full unfiltered list so pills don't disappear mid-filter
  const availableAuthors = useMemo(
    () => [...new Set(events.map(e => e.loggedByName).filter((n): n is string => Boolean(n)))],
    [events],
  );

  const filteredEvents = useMemo(() => applyHistoryFilters(events, filters), [events, filters]);

  const filterActive = isFilterActive(filters);

  function toggleBaby(id: string) {
    setFilters(f => {
      const next = new Set(f.babyIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, babyIds: next };
    });
  }

  function toggleType(type: EventType) {
    setFilters(f => {
      const next = new Set(f.types);
      next.has(type) ? next.delete(type) : next.add(type);
      return { ...f, types: next };
    });
  }

  function toggleAuthor(author: string) {
    setFilters(f => {
      const next = new Set(f.authors);
      next.has(author) ? next.delete(author) : next.add(author);
      return { ...f, authors: next };
    });
  }

  if (showSkeleton) {
    return (
      <div className={styles.page}>
        <div className={styles.skeletonScroll}>
          {[0, 1, 2].map(g => (
            <div key={g} className={styles.skeletonGroup}>
              <div className={styles.skeletonSectionHeader}>
                <div className={styles.skeletonPill} style={{ width: 72, height: 13 }} />
              </div>
              {[0, 1, 2, 3].map(r => (
                <div key={r} className={styles.skeletonRow}>
                  <div
                    className={styles.skeletonPill}
                    style={{ width: 20, height: 20, borderRadius: '50%' }}
                  />
                  <div className={styles.skeletonPill} style={{ width: 56, height: 14 }} />
                  <div className={styles.skeletonPill} style={{ flex: 1, height: 14 }} />
                  <div className={styles.skeletonPill} style={{ width: 44, height: 13 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <BottomTabBar />
      </div>
    );
  }

  function handleAddForDay(date: Date) {
    setFilterPanelOpen(false);
    setQuickAdd({ date, baby: null, type: null });
  }

  function handleQuickSubmit(payload: LogEventPayload) {
    logEvent(payload).catch(console.error);
    setQuickAdd(null);
  }

  function defaultTimeForDay(date: Date): string {
    const now = new Date();
    const isCurrentPeriod = date.getTime() + 24 * 60 * 60 * 1000 > now.getTime();
    if (isCurrentPeriod) {
      return now.toISOString();
    }
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  const editBaby = editingEvent ? (babies.find(b => b.id === editingEvent.babyId) ?? null) : null;

  return (
    <div className={styles.page}>
      <EmailVerificationBanner />

      <div className={styles.scroll}>
        <HistoryFeed
          events={filteredEvents}
          babies={babies}
          resetHour={prefs.wakeHour}
          onDelete={id => deleteEvent(id).catch(console.error)}
          onRestore={event =>
            logEvent({
              babyId: event.babyId,
              type: event.type,
              startedAt: event.startedAt,
              endedAt: event.endedAt ?? undefined,
              value: event.value ?? undefined,
              unit: event.unit ?? undefined,
              notes: event.notes ?? undefined,
            }).catch(console.error)
          }
          onEdit={setEditingEvent}
          onAddForDay={handleAddForDay}
          onRefresh={poll}
        />
      </div>

      {/* Backdrop: captures outside clicks so they dismiss the panel instead of hitting rows */}
      {filterPanelOpen && (
        <div className={styles.filterBackdrop} onClick={() => setFilterPanelOpen(false)} />
      )}

      {/* Filter anchor: FAB always hangs above it; panel grows anchor upward when open */}
      <div className={styles.filterPanelAnchor}>
        <button
          className={styles.filterFab}
          onClick={() => setFilterPanelOpen(v => !v)}
          type="button"
          aria-label={i18n.t('history.filter_open')}
          aria-expanded={filterPanelOpen}
        >
          <FilterIcon size={20} color="currentColor" />
          {filterActive && <span className={styles.filterBadge} />}
        </button>

        {filterPanelOpen && (
          <div className={styles.filterPanel}>
            {babies.length > 1 && (
              <>
                <p className={styles.quickLabel}>{i18n.t('history.filter_babies')}</p>
                <div className={styles.filterPills}>
                  {babies.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      className={`${styles.filterPill}${filters.babyIds.has(b.id) ? ` ${styles.filterPillActive}` : ''}`}
                      onClick={() => toggleBaby(b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className={styles.quickLabel}>{i18n.t('history.filter_types')}</p>
            <div className={styles.filterPills}>
              {EVENT_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  className={`${styles.filterPill}${filters.types.has(type) ? ` ${styles.filterPillActive}` : ''}`}
                  onClick={() => toggleType(type)}
                >
                  {i18n.t(`log_sheet.types.${type}`)}
                </button>
              ))}
            </div>

            {availableAuthors.length > 1 && (
              <>
                <p className={styles.quickLabel}>{i18n.t('history.filter_authors')}</p>
                <div className={styles.filterPills}>
                  {availableAuthors.map(author => (
                    <button
                      key={author}
                      type="button"
                      className={`${styles.filterPill}${filters.authors.has(author) ? ` ${styles.filterPillActive}` : ''}`}
                      onClick={() => toggleAuthor(author)}
                    >
                      {author}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              className={styles.quickCancel}
              onClick={() => {
                setFilters(emptyFilters());
                setFilterPanelOpen(false);
              }}
            >
              {i18n.t('history.filter_clear_all')}
            </button>
          </div>
        )}
      </div>

      {/* Edit existing event */}
      <LogSheet
        visible={editingEvent !== null}
        baby={editBaby}
        eventType={editingEvent?.type ?? null}
        initialEvent={editingEvent ?? undefined}
        onEdit={(id, payload) => {
          editEvent(id, payload).catch(console.error);
          setEditingEvent(null);
        }}
        onSubmit={() => setEditingEvent(null)}
        onClose={() => setEditingEvent(null)}
      />

      {/* Quick-add: baby selector → type selector → LogSheet */}
      {quickAdd !== null && quickAdd.baby === null && (
        <div className={styles.quickPanel}>
          <p className={styles.quickLabel}>{i18n.t('history.quick_add_select_baby')}</p>
          <div className={styles.quickPills}>
            {babies.map(b => (
              <button
                key={b.id}
                className={styles.quickPill}
                onClick={() => setQuickAdd({ ...quickAdd, baby: b })}
              >
                {b.name}
              </button>
            ))}
          </div>
          <button className={styles.quickCancel} onClick={() => setQuickAdd(null)}>
            {i18n.t('common.cancel')}
          </button>
        </div>
      )}
      {quickAdd !== null && quickAdd.baby !== null && quickAdd.type === null && (
        <div className={styles.quickPanel}>
          <p className={styles.quickLabel}>{i18n.t('history.quick_add_select_type')}</p>
          <div className={styles.quickPills}>
            {EVENT_TYPES.map(t => (
              <button
                key={t}
                className={styles.quickPill}
                onClick={() => setQuickAdd({ ...quickAdd, type: t })}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button
            className={styles.quickCancel}
            onClick={() => setQuickAdd(q => (q ? { ...q, baby: null } : null))}
          >
            {i18n.t('common.back')}
          </button>
        </div>
      )}
      <LogSheet
        visible={quickAdd !== null && quickAdd.baby !== null && quickAdd.type !== null}
        baby={quickAdd?.baby ?? null}
        eventType={quickAdd?.type ?? null}
        initialStartedAt={quickAdd?.date ? defaultTimeForDay(quickAdd.date) : undefined}
        onSubmit={handleQuickSubmit}
        onClose={() => setQuickAdd(null)}
      />

      <BottomTabBar />
    </div>
  );
}
