'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  configure,
  useAuth,
  useEventStore,
  api,
  applyHistoryFilters,
  emptyFilters,
  getEventSide,
  isFilterActive,
  i18n,
  EVENT_TYPES,
  getEventStashOz,
  parseBottleNotes,
  summarizeStashInventory,
  defaultQuickAddDateForHistoryDay,
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
  const availableSides = useMemo(
    () =>
      [
        ...new Set(
          events
            .map(getEventSide)
            .filter((side): side is 'left' | 'right' | 'both' => Boolean(side)),
        ),
      ].sort((a, b) => {
        const order = { left: 0, right: 1, both: 2 };
        return order[a] - order[b];
      }),
    [events],
  );
  const availableStashOz = useMemo(
    () =>
      [...new Set(events.map(getEventStashOz).filter((oz): oz is number => oz > 0))].sort(
        (a, b) => a - b,
      ),
    [events],
  );
  const stashInventory = useMemo(() => summarizeStashInventory(events), [events]);
  const showStashInventory = stashInventory.totalOz > 0;

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

  function toggleSide(side: 'left' | 'right' | 'both') {
    setFilters(f => {
      const next = new Set(f.sides);
      next.has(side) ? next.delete(side) : next.add(side);
      return { ...f, sides: next };
    });
  }

  function toggleStashOz(oz: number) {
    setFilters(f => {
      const next = new Set(f.stashOz);
      next.has(oz) ? next.delete(oz) : next.add(oz);
      return { ...f, stashOz: next };
    });
  }

  function stashLocationLabel(location: 'fridge' | 'freezer' | 'unknown'): string {
    if (location === 'fridge') {
      return i18n.t('log_sheet.stash_fridge');
    }
    if (location === 'freezer') {
      return i18n.t('log_sheet.stash_freezer');
    }
    return location;
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
    return defaultQuickAddDateForHistoryDay(date, new Date()).toISOString();
  }

  const editBaby = editingEvent ? (babies.find(b => b.id === editingEvent.babyId) ?? null) : null;

  return (
    <div className={styles.page}>
      <EmailVerificationBanner />

      <div className={styles.scroll}>
      {showStashInventory && (
          <section className={styles.stashCard}>
            <p className={styles.quickLabel}>{i18n.t('history.stash_inventory_title')}</p>
            <h2 className={styles.stashValue}>
              {i18n.t('history.stash_inventory_total', { oz: String(stashInventory.totalOz) })}
            </h2>
            <p className={styles.stashSubhead}>{i18n.t('history.stash_inventory_subtitle')}</p>
            <p className={styles.stashDetail}>
              {i18n.t('history.stash_inventory_detail', {
                bottles: String(stashInventory.totalBottles),
                sessions: String(stashInventory.totalSessions),
              })}
            </p>
            <p className={styles.stashDetail}>
              {i18n.t('history.stash_inventory_breakdown', {
                fridgeOz: String(stashInventory.fridgeOz),
                freezerOz: String(stashInventory.freezerOz),
              })}
            </p>
            {stashInventory.expiredBottles > 0 ? (
              <p className={styles.stashNote}>
                {i18n.t('history.stash_inventory_expired', {
                  count: stashInventory.expiredBottles,
                })}
              </p>
            ) : stashInventory.expiringSoonBottles > 0 ? (
              <p className={styles.stashNote}>
                {i18n.t('history.stash_inventory_expiring', {
                  count: stashInventory.expiringSoonBottles,
                })}
              </p>
            ) : stashInventory.oldestAgeDays != null && stashInventory.oldestLocation != null ? (
              <p className={styles.stashNote}>
                {i18n.t('history.stash_inventory_fifo', {
                  location: stashLocationLabel(stashInventory.oldestLocation),
                  days: String(stashInventory.oldestAgeDays),
                })}
              </p>
            ) : null}
            {stashInventory.unmatchedUsageOz > 0 && (
              <p className={styles.stashNote}>
                {i18n.t('history.stash_inventory_unmatched', {
                  oz: String(stashInventory.unmatchedUsageOz),
                })}
              </p>
            )}
          </section>
        )}
        <HistoryFeed
          events={filteredEvents}
          babies={babies}
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

            {availableSides.length > 0 && (
              <>
                <p className={styles.quickLabel}>{i18n.t('history.filter_sides')}</p>
                <div className={styles.filterPills}>
                  {availableSides.map(side => (
                    <button
                      key={side}
                      type="button"
                      className={`${styles.filterPill}${filters.sides.has(side) ? ` ${styles.filterPillActive}` : ''}`}
                      onClick={() => toggleSide(side)}
                    >
                      {i18n.t(
                        side === 'both' ? 'log_sheet.pump_both' : `log_sheet.nursing_${side}`,
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {availableStashOz.length > 0 && (
              <>
                <p className={styles.quickLabel}>{i18n.t('history.filter_stash')}</p>
                <div className={styles.filterPills}>
                  {availableStashOz.map(oz => (
                    <button
                      key={oz}
                      type="button"
                      className={`${styles.filterPill}${filters.stashOz.has(oz) ? ` ${styles.filterPillActive}` : ''}`}
                      onClick={() => toggleStashOz(oz)}
                    >
                      {oz}oz
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
