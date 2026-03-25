/** useAlarms — polls server-side nap alarms every 15s and exposes create/dismiss/reschedule. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NapAlarm } from '../types';
import { api } from '../api/client';

const POLL_INTERVAL_MS = 15_000;

export function useAlarms(): {
  alarms: NapAlarm[];
  getAlarmForBaby: (babyId: string) => NapAlarm | undefined;
  createAlarm: (
    babyId: string,
    firesAt: string,
    durationMs: number,
    label: string,
  ) => Promise<NapAlarm>;
  dismissAlarm: (id: string) => Promise<void>;
  rescheduleAlarm: (id: string, firesAt: string, durationMs: number) => Promise<NapAlarm>;
} {
  const [alarms, setAlarms] = useState<NapAlarm[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    api.alarms
      .active()
      .then(active => {
        setAlarms(active);
      })
      .catch(() => {
        /* offline — keep last known state */
      });
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    // Re-poll immediately when the tab becomes visible again
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        poll();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleVisibility);
      }
    };
  }, [poll]);

  const getAlarmForBaby = useCallback(
    (babyId: string) => alarms.find(a => a.babyId === babyId),
    [alarms],
  );

  const createAlarm = useCallback(
    async (babyId: string, firesAt: string, durationMs: number, label: string) => {
      const alarm = await api.alarms.create({ babyId, firesAt, durationMs, label });
      setAlarms(prev => [...prev.filter(a => a.babyId !== babyId), alarm]);
      return alarm;
    },
    [],
  );

  const dismissAlarm = useCallback(async (id: string) => {
    await api.alarms.update(id, { dismissedAt: new Date().toISOString() });
    setAlarms(prev => prev.filter(a => a.id !== id));
  }, []);

  const rescheduleAlarm = useCallback(async (id: string, firesAt: string, durationMs: number) => {
    const alarm = await api.alarms.update(id, { firesAt, durationMs });
    setAlarms(prev => prev.map(a => (a.id === id ? alarm : a)));
    return alarm;
  }, []);

  return { alarms, getAlarmForBaby, createAlarm, dismissAlarm, rescheduleAlarm };
}
