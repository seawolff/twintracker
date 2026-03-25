/** Central event store: WebSocket-first sync with delta-poll fallback and soft-delete filtering. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { LatestEventMap, LogEventPayload, TrackerEvent } from '../types';

const POLL_INTERVAL_MS = 15_000;

function buildLatestMap(events: TrackerEvent[]): LatestEventMap {
  const map: LatestEventMap = {};
  for (const event of events) {
    const key = `${event.babyId}:${event.type}`;
    const existing = map[key];
    if (!existing || event.startedAt > existing.startedAt) {
      map[key] = event;
    }
  }
  return map;
}

// ready: pass !authLoading so polling doesn't start before the auth token is set
export function useEventStore(ready = true) {
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [latest, setLatest] = useState<LatestEventMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const sinceRef = useRef<string>(new Date(0).toISOString());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const newEvents = await api.events.list(sinceRef.current);
      if (newEvents.length > 0) {
        setEvents(prev => {
          const map = new Map(prev.map(e => [e.id, e]));
          for (const e of newEvents) {
            map.set(e.id, e);
          }
          const merged = Array.from(map.values())
            .filter(e => !e.deletedAt)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          setLatest(buildLatestMap(merged));
          return merged;
        });
        const maxTs = newEvents.reduce((acc, e) => {
          const ts = e.updatedAt && e.updatedAt > e.createdAt ? e.updatedAt : e.createdAt;
          return ts > acc ? ts : acc;
        }, sinceRef.current);
        // +1ms: DB stores μs precision but API returns ms precision; without this,
        // boundary events (e.g. updated_at=18:06:00.805123) would be re-fetched every poll.
        sinceRef.current = new Date(new Date(maxTs).getTime() + 1).toISOString();
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  const schedulePoll = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      poll().then(schedulePoll);
    }, POLL_INTERVAL_MS);
  }, [poll]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const init = async () => {
      try {
        const allEvents = await api.events.list();
        setEvents(allEvents);
        setLatest(buildLatestMap(allEvents));
        if (allEvents.length > 0) {
          const maxTs = allEvents.reduce((acc, e) => {
            const ts = e.updatedAt && e.updatedAt > e.createdAt ? e.updatedAt : e.createdAt;
            return ts > acc ? ts : acc;
          }, new Date(0).toISOString());
          sinceRef.current = new Date(new Date(maxTs).getTime() + 1).toISOString();
        }
      } catch {
        // init failed — fall back to poll
      } finally {
        setLoading(false);
      }
      poll().then(schedulePoll);
    };
    init();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [ready, poll, schedulePoll]);

  useEffect(() => {
    const handle = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        poll().then(schedulePoll);
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handle);
      window.addEventListener('focus', handle);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handle);
        window.removeEventListener('focus', handle);
      }
    };
  }, [poll, schedulePoll]);

  const logEvent = useCallback(async (payload: LogEventPayload): Promise<TrackerEvent> => {
    const optimistic: TrackerEvent = {
      id: `optimistic-${Date.now()}`,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    setEvents(prev => [optimistic, ...prev]);
    setLatest(prev => ({ ...prev, [`${payload.babyId}:${payload.type}`]: optimistic }));

    try {
      const confirmed = await api.events.create(payload);
      setEvents(prev => prev.map(e => (e.id === optimistic.id ? confirmed : e)));
      setLatest(prev => ({ ...prev, [`${payload.babyId}:${payload.type}`]: confirmed }));
      return confirmed;
    } catch (err) {
      setEvents(prev => prev.filter(e => e.id !== optimistic.id));
      setLatest(prev => {
        const { [`${payload.babyId}:${payload.type}`]: _removed, ...rest } = prev;
        return rest;
      });
      throw err;
    }
  }, []);

  const closeNap = useCallback(
    async (event: TrackerEvent, endedAt: string): Promise<TrackerEvent> => {
      // Optimistic update so theme and UI flip immediately on wake.
      const optimistic = { ...event, endedAt };
      setEvents(prev => prev.map(e => (e.id === event.id ? optimistic : e)));
      setLatest(prev => ({ ...prev, [`${event.babyId}:${event.type}`]: optimistic }));
      try {
        const updated = await api.events.patch(event.id, { endedAt });
        setEvents(prev => prev.map(e => (e.id === event.id ? updated : e)));
        setLatest(prev => ({ ...prev, [`${updated.babyId}:${updated.type}`]: updated }));
        return updated;
      } catch (err) {
        // Rollback on failure.
        setEvents(prev => prev.map(e => (e.id === event.id ? event : e)));
        setLatest(prev => ({ ...prev, [`${event.babyId}:${event.type}`]: event }));
        throw err;
      }
    },
    [],
  );

  const clearAllEvents = useCallback(async (): Promise<void> => {
    await api.events.deleteAll();
    // Immediately wipe local state so all baby cards clear without waiting for next poll
    setEvents([]);
    setLatest({});
    sinceRef.current = new Date(0).toISOString();
  }, []);

  const deleteEvent = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic: remove immediately
      setEvents(prev => {
        const next = prev.filter(e => e.id !== id);
        setLatest(buildLatestMap(next));
        return next;
      });
      try {
        await api.events.delete(id);
      } catch (err) {
        // Restore by re-polling
        poll();
        throw err;
      }
    },
    [poll],
  );

  const editEvent = useCallback(
    async (id: string, payload: Partial<LogEventPayload>): Promise<TrackerEvent> => {
      const updated = await api.events.patch(id, payload);
      setEvents(prev => {
        const next = prev.map(e => (e.id === id ? updated : e));
        setLatest(buildLatestMap(next));
        return next;
      });
      return updated;
    },
    [],
  );

  return {
    events,
    latest,
    loading,
    error,
    logEvent,
    closeNap,
    deleteEvent,
    editEvent,
    clearAllEvents,
    poll,
  };
}
