import { describe, it, expect } from '@jest/globals';
import {
  applyHistoryFilters,
  emptyFilters,
  getEventSide,
  isFilterActive,
  type HistoryFilters,
} from './filterEvents';
import type { TrackerEvent } from '../types';

function makeEvent(
  overrides: Partial<TrackerEvent> & { babyId: string; type: TrackerEvent['type'] },
): TrackerEvent {
  return {
    id: Math.random().toString(36).slice(2),
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const BABY_A = 'baby-a';
const BABY_B = 'baby-b';

const events: TrackerEvent[] = [
  makeEvent({ babyId: BABY_A, type: 'bottle', loggedByName: 'Mom' }),
  makeEvent({ babyId: BABY_A, type: 'nap', loggedByName: 'Mom' }),
  makeEvent({ babyId: BABY_A, type: 'nursing', loggedByName: 'Mom', notes: 'left' }),
  makeEvent({
    babyId: BABY_B,
    type: 'pump',
    loggedByName: 'Dad',
    notes: 'side=both;stashCount=2;stashOz=4',
  }),
  makeEvent({
    babyId: BABY_A,
    type: 'bottle',
    loggedByName: 'Dad',
    value: 4,
    notes: 'source=freezer',
  }),
  makeEvent({ babyId: BABY_B, type: 'diaper', loggedByName: 'Dad' }),
  makeEvent({ babyId: BABY_A, type: 'diaper', loggedByName: undefined }),
];

describe('emptyFilters', () => {
  it('returns sets with zero entries', () => {
    const f = emptyFilters();
    expect(f.babyIds.size).toBe(0);
    expect(f.types.size).toBe(0);
    expect(f.authors.size).toBe(0);
    expect(f.sides.size).toBe(0);
    expect(f.stashOz.size).toBe(0);
  });

  it('returns a new object each call (no shared reference)', () => {
    const a = emptyFilters();
    const b = emptyFilters();
    a.babyIds.add('x');
    expect(b.babyIds.size).toBe(0);
  });
});

describe('isFilterActive', () => {
  it('returns false for empty filters', () => {
    expect(isFilterActive(emptyFilters())).toBe(false);
  });

  it('returns true when babyIds is non-empty', () => {
    const f: HistoryFilters = { ...emptyFilters(), babyIds: new Set([BABY_A]) };
    expect(isFilterActive(f)).toBe(true);
  });

  it('returns true when types is non-empty', () => {
    const f: HistoryFilters = { ...emptyFilters(), types: new Set(['bottle'] as const) };
    expect(isFilterActive(f)).toBe(true);
  });

  it('returns true when authors is non-empty', () => {
    const f: HistoryFilters = { ...emptyFilters(), authors: new Set(['Mom']) };
    expect(isFilterActive(f)).toBe(true);
  });

  it('returns true when sides is non-empty', () => {
    const f: HistoryFilters = { ...emptyFilters(), sides: new Set(['left']) };
    expect(isFilterActive(f)).toBe(true);
  });

  it('returns true when stashOz is non-empty', () => {
    const f: HistoryFilters = { ...emptyFilters(), stashOz: new Set([8]) };
    expect(isFilterActive(f)).toBe(true);
  });
});

describe('getEventSide', () => {
  it('extracts nursing side from notes', () => {
    expect(getEventSide(makeEvent({ babyId: BABY_A, type: 'nursing', notes: 'right' }))).toBe(
      'right',
    );
  });

  it('extracts pump side from structured pump notes', () => {
    expect(
      getEventSide(
        makeEvent({
          babyId: BABY_B,
          type: 'pump',
          notes: 'side=both;stashCount=2;stashOz=4',
        }),
      ),
    ).toBe('both');
  });

  it('returns null for non-sided events', () => {
    expect(getEventSide(makeEvent({ babyId: BABY_A, type: 'bottle' }))).toBeNull();
  });
});

describe('applyHistoryFilters', () => {
  it('returns all events when no filters are active', () => {
    const result = applyHistoryFilters(events, emptyFilters());
    expect(result).toHaveLength(events.length);
  });

  it('returns the same array reference when no filters are active (fast path)', () => {
    const result = applyHistoryFilters(events, emptyFilters());
    expect(result).toBe(events);
  });

  it('filters by baby ID (OR within dimension)', () => {
    const f: HistoryFilters = { ...emptyFilters(), babyIds: new Set([BABY_A]) };
    const result = applyHistoryFilters(events, f);
    expect(result.every(e => e.babyId === BABY_A)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('shows events for multiple selected babies', () => {
    const f: HistoryFilters = { ...emptyFilters(), babyIds: new Set([BABY_A, BABY_B]) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(events.length);
  });

  it('filters by event type', () => {
    const f: HistoryFilters = { ...emptyFilters(), types: new Set(['bottle'] as const) };
    const result = applyHistoryFilters(events, f);
    expect(result.every(e => e.type === 'bottle')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('filters by multiple event types (OR within dimension)', () => {
    const f: HistoryFilters = {
      ...emptyFilters(),
      types: new Set(['bottle', 'diaper'] as const),
    };
    const result = applyHistoryFilters(events, f);
    expect(result.every(e => e.type === 'bottle' || e.type === 'diaper')).toBe(true);
    expect(result).toHaveLength(4);
  });

  it('filters by author', () => {
    const f: HistoryFilters = { ...emptyFilters(), authors: new Set(['Mom']) };
    const result = applyHistoryFilters(events, f);
    expect(result.every(e => e.loggedByName === 'Mom')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('excludes events with undefined loggedByName when author filter is active', () => {
    const f: HistoryFilters = { ...emptyFilters(), authors: new Set(['Mom']) };
    const result = applyHistoryFilters(events, f);
    // The diaper event for BABY_A with loggedByName: undefined should not appear
    expect(result.every(e => e.loggedByName !== undefined)).toBe(true);
  });

  it('AND logic across dimensions: baby + type', () => {
    const f: HistoryFilters = {
      babyIds: new Set([BABY_A]),
      types: new Set(['bottle'] as const),
      authors: new Set(),
      sides: new Set(),
      stashOz: new Set(),
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(2);
    expect(result[0].babyId).toBe(BABY_A);
    expect(result[0].type).toBe('bottle');
  });

  it('AND logic across all three dimensions', () => {
    const f: HistoryFilters = {
      babyIds: new Set([BABY_A]),
      types: new Set(['bottle'] as const),
      authors: new Set(['Mom']),
      sides: new Set(),
      stashOz: new Set(),
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no events match', () => {
    const f: HistoryFilters = {
      babyIds: new Set([BABY_A]),
      types: new Set(['milestone'] as const),
      authors: new Set(),
      sides: new Set(),
      stashOz: new Set(),
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(0);
  });

  it('filters by stashed milk amount in oz', () => {
    const f: HistoryFilters = { ...emptyFilters(), stashOz: new Set([8]) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('pump');
    expect(result[0].notes).toContain('stashCount=2');
  });

  it('filters bottle logs by stash-used amount in oz', () => {
    const f: HistoryFilters = { ...emptyFilters(), stashOz: new Set([4]) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bottle');
    expect(result[0].notes).toBe('source=freezer');
  });

  it('stash filter excludes events without stash metadata', () => {
    const f: HistoryFilters = { ...emptyFilters(), stashOz: new Set([6]) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(0);
  });

  it('filters by nursing side', () => {
    const f: HistoryFilters = { ...emptyFilters(), sides: new Set(['left']) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('nursing');
    expect(result[0].notes).toBe('left');
  });

  it('filters by pump side', () => {
    const f: HistoryFilters = { ...emptyFilters(), sides: new Set(['both']) };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('pump');
  });
});
