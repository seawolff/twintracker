import type { EventType, TrackerEvent } from '../types';
import { getEventStashOz, parsePumpNotes } from './pumpHelpers';

export type HistorySideFilter = 'left' | 'right' | 'both';

export function getEventSide(
  event: Pick<TrackerEvent, 'type' | 'notes'>,
): HistorySideFilter | null {
  if (event.type === 'nursing') {
    return event.notes === 'left' || event.notes === 'right' ? event.notes : null;
  }
  if (event.type === 'pump') {
    const side = parsePumpNotes(event.notes).side;
    return side === 'left' || side === 'right' || side === 'both' ? side : null;
  }
  return null;
}

export interface HistoryFilters {
  /** Empty = show all babies. */
  babyIds: Set<string>;
  /** Empty = show all event types. */
  types: Set<EventType>;
  /** Empty = show all authors. Matched against event.loggedByName. */
  authors: Set<string>;
  /** Empty = show all nursing/pump sides. */
  sides: Set<HistorySideFilter>;
  /** Empty = show all stash amounts. Matched against stash oz added or used on stash-related logs. */
  stashOz: Set<number>;
}

/** Returns a zero-state filter object (no active filters). */
export function emptyFilters(): HistoryFilters {
  return {
    babyIds: new Set(),
    types: new Set(),
    authors: new Set(),
    sides: new Set(),
    stashOz: new Set(),
  };
}

/** Returns true when at least one filter dimension is active. */
export function isFilterActive(filters: HistoryFilters): boolean {
  return (
    filters.babyIds.size > 0 ||
    filters.types.size > 0 ||
    filters.authors.size > 0 ||
    filters.sides.size > 0 ||
    filters.stashOz.size > 0
  );
}

/**
 * Applies filters to an event list.
 *
 * Logic: AND across dimensions (event must satisfy every active dimension),
 *        OR within a dimension (event matches if it satisfies any value in the set).
 * An empty set for a dimension means "no constraint" — all events pass that check.
 */
export function applyHistoryFilters(
  events: TrackerEvent[],
  filters: HistoryFilters,
): TrackerEvent[] {
  if (!isFilterActive(filters)) {
    return events;
  }
  return events.filter(e => {
    if (filters.babyIds.size > 0 && !filters.babyIds.has(e.babyId)) {
      return false;
    }
    if (filters.types.size > 0 && !filters.types.has(e.type)) {
      return false;
    }
    if (filters.authors.size > 0 && !filters.authors.has(e.loggedByName ?? '')) {
      return false;
    }
    if (filters.sides.size > 0) {
      const side = getEventSide(e);
      if (!side || !filters.sides.has(side)) {
        return false;
      }
    }
    if (filters.stashOz.size > 0 && !filters.stashOz.has(getEventStashOz(e))) {
      return false;
    }
    return true;
  });
}
