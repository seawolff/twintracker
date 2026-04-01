import { describe, it, expect } from '@jest/globals';
import {
  applyHistoryFilters,
  emptyFilters,
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
  makeEvent({ babyId: BABY_B, type: 'bottle', loggedByName: 'Dad' }),
  makeEvent({ babyId: BABY_B, type: 'diaper', loggedByName: 'Dad' }),
  makeEvent({ babyId: BABY_A, type: 'diaper', loggedByName: undefined }),
];

describe('emptyFilters', () => {
  it('returns sets with zero entries', () => {
    const f = emptyFilters();
    expect(f.babyIds.size).toBe(0);
    expect(f.types.size).toBe(0);
    expect(f.authors.size).toBe(0);
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
    expect(result).toHaveLength(2);
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
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
    expect(result[0].babyId).toBe(BABY_A);
    expect(result[0].type).toBe('bottle');
  });

  it('AND logic across all three dimensions', () => {
    const f: HistoryFilters = {
      babyIds: new Set([BABY_A]),
      types: new Set(['bottle'] as const),
      authors: new Set(['Mom']),
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no events match', () => {
    const f: HistoryFilters = {
      babyIds: new Set([BABY_A]),
      types: new Set(['milestone'] as const),
      authors: new Set(),
    };
    const result = applyHistoryFilters(events, f);
    expect(result).toHaveLength(0);
  });
});
