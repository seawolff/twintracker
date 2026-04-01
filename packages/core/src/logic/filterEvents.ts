import type { EventType, TrackerEvent } from '../types';

export interface HistoryFilters {
  /** Empty = show all babies. */
  babyIds: Set<string>;
  /** Empty = show all event types. */
  types: Set<EventType>;
  /** Empty = show all authors. Matched against event.loggedByName. */
  authors: Set<string>;
}

/** Returns a zero-state filter object (no active filters). */
export function emptyFilters(): HistoryFilters {
  return { babyIds: new Set(), types: new Set(), authors: new Set() };
}

/** Returns true when at least one filter dimension is active. */
export function isFilterActive(filters: HistoryFilters): boolean {
  return filters.babyIds.size > 0 || filters.types.size > 0 || filters.authors.size > 0;
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
    return true;
  });
}
