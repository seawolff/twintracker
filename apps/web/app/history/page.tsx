'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { configure, useAuth, useEventStore, usePreferences, api } from '@tt/core';
import type { Baby, EventType, LogEventPayload, TrackerEvent } from '@tt/core';
import { HistoryFeed, LogSheet } from '@tt/ui';
import { BottomTabBar } from '../../components/BottomTabBar';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';
import styles from './history.module.scss';

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
  const [babies, setBabies] = useState<Baby[]>([]);
  const [editingEvent, setEditingEvent] = useState<TrackerEvent | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null);

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

  if (authLoading || eventsLoading) {
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
          events={events}
          babies={babies}
          resetHour={prefs.wakeHour}
          onDelete={id => deleteEvent(id).catch(console.error)}
          onEdit={setEditingEvent}
          onAddForDay={handleAddForDay}
          onRefresh={poll}
        />
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
          <p className={styles.quickLabel}>Select baby</p>
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
            Cancel
          </button>
        </div>
      )}
      {quickAdd !== null && quickAdd.baby !== null && quickAdd.type === null && (
        <div className={styles.quickPanel}>
          <p className={styles.quickLabel}>Select type</p>
          <div className={styles.quickPills}>
            {(
              [
                'bottle',
                'nap',
                'sleep',
                'diaper',
                'nursing',
                'medicine',
                'food',
                'milestone',
              ] as EventType[]
            ).map(t => (
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
            Back
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
