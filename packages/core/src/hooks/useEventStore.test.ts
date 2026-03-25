import type { LatestEventMap, TrackerEvent, EventType } from '../types';

// Mirror of the poll merge logic from useEventStore
// Simulates: map prev events by id, upsert newEvents, filter deleted, sort descending
function mergePoll(prev: TrackerEvent[], newEvents: TrackerEvent[]): TrackerEvent[] {
  const map = new Map(prev.map(e => [e.id, e]));
  for (const e of newEvents) {
    map.set(e.id, e);
  }
  return Array.from(map.values())
    .filter(e => !e.deletedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// Mirror of the buildLatestMap logic from useEventStore
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

function makeEvent(
  id: string,
  babyId: string,
  type: EventType,
  startedAt: string,
  endedAt?: string,
  deletedAt?: string,
): TrackerEvent {
  return { id, babyId, type, startedAt, endedAt, createdAt: startedAt, deletedAt };
}

describe('buildLatestMap', () => {
  describe('1. Empty array → empty map', () => {
    it('returns an empty object for an empty events array', () => {
      const result = buildLatestMap([]);
      expect(result).toEqual({});
    });
  });

  describe('2. Single event → keyed as ${babyId}:${type}', () => {
    it('stores the event under the correct composite key', () => {
      const event = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z');
      const result = buildLatestMap([event]);
      expect(result['baby-1:bottle']).toEqual(event);
      expect(Object.keys(result)).toHaveLength(1);
    });
  });

  describe('3. Two events same baby/type → most recent wins', () => {
    it('keeps the event with the later startedAt', () => {
      const older = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T09:00:00.000Z');
      const newer = makeEvent('e2', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z');
      const result = buildLatestMap([older, newer]);
      expect(result['baby-1:bottle'].id).toBe('e2');
    });

    it('most recent wins regardless of array order (newer first)', () => {
      const older = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T09:00:00.000Z');
      const newer = makeEvent('e2', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z');
      const result = buildLatestMap([newer, older]);
      expect(result['baby-1:bottle'].id).toBe('e2');
    });
  });

  describe('4. Two events different babies → both in map with different keys', () => {
    it('stores separate entries for different babyIds', () => {
      const baby1Event = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z');
      const baby2Event = makeEvent('e2', 'baby-2', 'bottle', '2024-01-01T10:00:00.000Z');
      const result = buildLatestMap([baby1Event, baby2Event]);
      expect(result['baby-1:bottle']).toEqual(baby1Event);
      expect(result['baby-2:bottle']).toEqual(baby2Event);
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('5. Two events different types same baby → both in map', () => {
    it('stores separate entries for different event types for the same baby', () => {
      const bottleEvent = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z');
      const napEvent = makeEvent('e2', 'baby-1', 'nap', '2024-01-01T11:00:00.000Z');
      const result = buildLatestMap([bottleEvent, napEvent]);
      expect(result['baby-1:bottle']).toEqual(bottleEvent);
      expect(result['baby-1:nap']).toEqual(napEvent);
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('6. Events in reverse order → still correct (most recent by startedAt wins)', () => {
    it('picks the correct winner when multiple events arrive in reverse chronological order', () => {
      const events = [
        makeEvent('e3', 'baby-1', 'diaper', '2024-01-01T08:00:00.000Z'),
        makeEvent('e2', 'baby-1', 'diaper', '2024-01-01T09:00:00.000Z'),
        makeEvent('e1', 'baby-1', 'diaper', '2024-01-01T10:00:00.000Z'),
      ];
      // Array is ordered newest-to-oldest (reverse chronological)
      const result = buildLatestMap(events);
      // e1 has the latest startedAt so it should win
      expect(result['baby-1:diaper'].id).toBe('e1');
    });

    it('correctly handles mixed babies and types in reverse order', () => {
      const events = [
        makeEvent('e4', 'baby-2', 'nap', '2024-01-01T11:00:00.000Z'),
        makeEvent('e3', 'baby-1', 'bottle', '2024-01-01T09:00:00.000Z'),
        makeEvent('e2', 'baby-2', 'nap', '2024-01-01T08:00:00.000Z'),
        makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T10:00:00.000Z'),
      ];
      const result = buildLatestMap(events);
      expect(result['baby-1:bottle'].id).toBe('e1');
      expect(result['baby-2:nap'].id).toBe('e4');
    });
  });
});

// ── poll merge: soft delete filtering ────────────────────────────────────────
// Regression tests for: cross-device sync not removing deleted events.
// The bug: hard DELETE on the server meant other devices never received a
// deletion signal. Fix: soft delete (deletedAt column); delta poll returns
// the soft-deleted event, and the merge step filters it out locally.

describe('poll merge — soft delete filtering', () => {
  it('removes an event when the server returns it with deletedAt set', () => {
    const active = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T09:00:00.000Z');
    const deleted = makeEvent(
      'e1',
      'baby-1',
      'nap',
      '2024-01-01T09:00:00.000Z',
      undefined,
      '2024-01-01T10:00:00.000Z',
    );
    const result = mergePoll([active], [deleted]);
    expect(result.find(e => e.id === 'e1')).toBeUndefined();
  });

  it('does not affect other events when one is deleted', () => {
    const bottle = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T08:00:00.000Z');
    const nap = makeEvent('e2', 'baby-1', 'nap', '2024-01-01T09:00:00.000Z');
    const deletedNap = makeEvent(
      'e2',
      'baby-1',
      'nap',
      '2024-01-01T09:00:00.000Z',
      undefined,
      '2024-01-01T10:00:00.000Z',
    );
    const result = mergePoll([bottle, nap], [deletedNap]);
    expect(result.map(e => e.id)).toEqual(['e1']);
  });

  it('keeps events that have no deletedAt', () => {
    const e1 = makeEvent('e1', 'baby-1', 'bottle', '2024-01-01T09:00:00.000Z');
    const e2 = makeEvent('e2', 'baby-1', 'diaper', '2024-01-01T08:00:00.000Z');
    const result = mergePoll([e1], [e2]);
    expect(result.map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('returns an empty list when all events are deleted', () => {
    const active = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T09:00:00.000Z');
    const deleted = makeEvent(
      'e1',
      'baby-1',
      'nap',
      '2024-01-01T09:00:00.000Z',
      undefined,
      '2024-01-01T10:00:00.000Z',
    );
    const result = mergePoll([active], [deleted]);
    expect(result).toHaveLength(0);
  });
});

// ── night-mode theme trigger ──────────────────────────────────────────────────
// Only active 'sleep' events should trigger night mode.
// Active 'nap' events must NOT flip the theme.

// Mirror of the setSleepActive logic used in App.tsx and page.tsx
function isAnySleepActive(babies: { id: string }[], latest: LatestEventMap): boolean {
  return babies.some(baby => {
    const ev = latest[`${baby.id}:sleep`];
    return ev != null && !ev.endedAt;
  });
}

describe('night-mode theme trigger', () => {
  it('is false when no events exist', () => {
    expect(isAnySleepActive([{ id: 'baby-1' }], {})).toBe(false);
  });

  it('is true when a baby has an active sleep event', () => {
    const sleepEvent = makeEvent('e1', 'baby-1', 'sleep', '2024-01-01T20:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:sleep': sleepEvent };
    expect(isAnySleepActive([{ id: 'baby-1' }], latest)).toBe(true);
  });

  it('is false when sleep event is already ended', () => {
    const sleepEvent = makeEvent(
      'e1',
      'baby-1',
      'sleep',
      '2024-01-01T20:00:00.000Z',
      '2024-01-02T06:00:00.000Z',
    );
    const latest: LatestEventMap = { 'baby-1:sleep': sleepEvent };
    expect(isAnySleepActive([{ id: 'baby-1' }], latest)).toBe(false);
  });

  it('is false when only a nap is active (naps must not trigger night mode)', () => {
    const napEvent = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:nap': napEvent };
    expect(isAnySleepActive([{ id: 'baby-1' }], latest)).toBe(false);
  });

  it('is true when any baby has an active sleep, even if another only has a nap', () => {
    const napEvent = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const sleepEvent = makeEvent('e2', 'baby-2', 'sleep', '2024-01-01T20:00:00.000Z');
    const latest: LatestEventMap = {
      'baby-1:nap': napEvent,
      'baby-2:sleep': sleepEvent,
    };
    expect(isAnySleepActive([{ id: 'baby-1' }, { id: 'baby-2' }], latest)).toBe(true);
  });
});

// ── closeNap optimistic update ────────────────────────────────────────────────
// Regression tests for: theme not switching on wake because closeNap was
// non-optimistic (waited for API before updating latest).
// Fix: closeNap immediately writes { ...event, endedAt } into latest so that
// sleepIsActive flips before the network round-trip completes.

// Mirror of the closeNap optimistic apply step
function applyCloseNap(
  latest: LatestEventMap,
  event: TrackerEvent,
  endedAt: string,
): LatestEventMap {
  const optimistic = { ...event, endedAt };
  return { ...latest, [`${event.babyId}:${event.type}`]: optimistic };
}

// Mirror of the closeNap rollback step
function rollbackCloseNap(latest: LatestEventMap, event: TrackerEvent): LatestEventMap {
  return { ...latest, [`${event.babyId}:${event.type}`]: event };
}

describe('closeNap — optimistic update', () => {
  it('immediately sets endedAt in latest before API responds', () => {
    const napEvent = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:nap': napEvent };

    const endedAt = '2024-01-01T11:30:00.000Z';
    const updated = applyCloseNap(latest, napEvent, endedAt);

    expect(updated['baby-1:nap'].endedAt).toBe(endedAt);
  });

  it('does not mutate the original latest map', () => {
    const napEvent = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:nap': napEvent };

    applyCloseNap(latest, napEvent, '2024-01-01T11:30:00.000Z');

    expect(latest['baby-1:nap'].endedAt).toBeUndefined();
  });

  it('handles sleep type (night event woken in daytime)', () => {
    const sleepEvent = makeEvent('e1', 'baby-1', 'sleep', '2024-01-01T20:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:sleep': sleepEvent };

    const endedAt = '2024-01-02T06:30:00.000Z';
    const updated = applyCloseNap(latest, sleepEvent, endedAt);

    expect(updated['baby-1:sleep'].endedAt).toBe(endedAt);
    expect(updated['baby-1:sleep'].id).toBe('e1');
  });

  it('preserves other babies in latest when closing one nap', () => {
    const baby1Nap = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const baby2Nap = makeEvent('e2', 'baby-2', 'nap', '2024-01-01T10:05:00.000Z');
    const latest: LatestEventMap = {
      'baby-1:nap': baby1Nap,
      'baby-2:nap': baby2Nap,
    };

    const updated = applyCloseNap(latest, baby1Nap, '2024-01-01T11:30:00.000Z');

    expect(updated['baby-1:nap'].endedAt).toBe('2024-01-01T11:30:00.000Z');
    expect(updated['baby-2:nap'].endedAt).toBeUndefined();
  });

  it('rolls back endedAt on API failure, restoring the original event', () => {
    const napEvent = makeEvent('e1', 'baby-1', 'nap', '2024-01-01T10:00:00.000Z');
    const latest: LatestEventMap = { 'baby-1:nap': napEvent };

    // Simulate optimistic apply
    const optimistic = applyCloseNap(latest, napEvent, '2024-01-01T11:30:00.000Z');
    expect(optimistic['baby-1:nap'].endedAt).toBe('2024-01-01T11:30:00.000Z');

    // Simulate rollback on API failure
    const rolledBack = rollbackCloseNap(optimistic, napEvent);
    expect(rolledBack['baby-1:nap'].endedAt).toBeUndefined();
    expect(rolledBack['baby-1:nap'].id).toBe('e1');
  });
});
