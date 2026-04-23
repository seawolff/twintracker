import type { TrackerEvent } from '../types';
import type { BottleSource, PumpSide, StashLocation } from '../config';

export interface PumpDetails {
  side: PumpSide;
  stashCount: number;
  stashOzPerBottle: number | null;
  stashLocation: StashLocation | null;
}

export interface BottleDetails {
  source: BottleSource | null;
}

export interface StashInventorySummary {
  totalOz: number;
  totalBottles: number;
  totalSessions: number;
  fridgeOz: number;
  freezerOz: number;
  fridgeBottles: number;
  freezerBottles: number;
  unknownOz: number;
  expiringSoonBottles: number;
  expiredBottles: number;
  oldestAgeDays: number | null;
  oldestLocation: StashLocation | 'unknown' | null;
  unmatchedUsageOz: number;
}

const DEFAULT_PUMP_DETAILS: PumpDetails = {
  side: 'both',
  stashCount: 0,
  stashOzPerBottle: null,
  stashLocation: null,
};

function normalizePumpSide(value: string | null | undefined): PumpSide {
  if (value === 'left' || value === 'right' || value === 'both') {
    return value;
  }
  return DEFAULT_PUMP_DETAILS.side;
}

function normalizeStashLocation(value: string | null | undefined): StashLocation | null {
  if (value === 'fridge' || value === 'freezer') {
    return value;
  }
  return null;
}

function normalizeBottleSource(value: string | null | undefined): BottleSource | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'formula' || normalized === 'fresh') {
    return normalized;
  }
  if (
    normalized === 'fridge' ||
    normalized === 'fridge stash' ||
    normalized === 'stash fridge'
  ) {
    return 'fridge';
  }
  if (
    normalized === 'freezer' ||
    normalized === 'freezer stash' ||
    normalized === 'stash freezer'
  ) {
    return 'freezer';
  }
  return null;
}

export function parsePumpNotes(notes?: string | null): PumpDetails {
  if (!notes) {
    return DEFAULT_PUMP_DETAILS;
  }
  if (!notes.includes('=')) {
    return {
      ...DEFAULT_PUMP_DETAILS,
      side: normalizePumpSide(notes),
    };
  }
  const entries = notes.split(';').map(part => part.trim());
  const map = new Map<string, string>();
  entries.forEach(entry => {
    const [key, value] = entry.split('=');
    if (key && value) {
      map.set(key, value);
    }
  });

  const stashCount = Number(map.get('stashCount') ?? 0);
  const stashOzPerBottle = Number(map.get('stashOz') ?? 0);
  return {
    side: normalizePumpSide(map.get('side')),
    stashCount: Number.isFinite(stashCount) && stashCount > 0 ? Math.floor(stashCount) : 0,
    stashOzPerBottle:
      Number.isFinite(stashOzPerBottle) && stashOzPerBottle > 0 ? stashOzPerBottle : null,
    stashLocation: normalizeStashLocation(map.get('stashLocation')),
  };
}

export function serializePumpNotes(details: PumpDetails): string {
  if (details.stashCount <= 0 || details.stashOzPerBottle == null) {
    return details.side;
  }
  const location = details.stashLocation ?? 'fridge';
  return `side=${details.side};stashCount=${details.stashCount};stashOz=${details.stashOzPerBottle};stashLocation=${location}`;
}

export function parseBottleNotes(notes?: string | null): BottleDetails {
  if (!notes) {
    return { source: null };
  }
  if (!notes.includes('=')) {
    return { source: normalizeBottleSource(notes) };
  }
  const entries = notes.split(';').map(part => part.trim());
  const map = new Map<string, string>();
  entries.forEach(entry => {
    const [key, value] = entry.split('=');
    if (key && value) {
      map.set(key, value);
    }
  });
  return { source: normalizeBottleSource(map.get('source')) };
}

export function serializeBottleNotes(details: BottleDetails): string | undefined {
  return details.source ? `source=${details.source}` : undefined;
}

export function isBottleBreastMilk(details: BottleDetails): boolean {
  return details.source == null || details.source !== 'formula';
}

export function formatPumpStash(details: PumpDetails): string | null {
  if (details.stashCount <= 0 || details.stashOzPerBottle == null) {
    return null;
  }
  if (details.stashLocation) {
    return `stash ${details.stashCount}x${details.stashOzPerBottle}oz · ${details.stashLocation}`;
  }
  return `stash ${details.stashCount}x${details.stashOzPerBottle}oz`;
}

export function formatBottleSource(details: BottleDetails): string | null {
  return details.source;
}

export function getPumpStashTotalOz(event: Pick<TrackerEvent, 'type' | 'notes'>): number {
  if (event.type !== 'pump') {
    return 0;
  }
  const details = parsePumpNotes(event.notes);
  if (details.stashCount <= 0 || details.stashOzPerBottle == null) {
    return 0;
  }
  return details.stashCount * details.stashOzPerBottle;
}

export function getEventStashOz(event: Pick<TrackerEvent, 'type' | 'notes' | 'value'>): number {
  if (event.type === 'pump') {
    return getPumpStashTotalOz(event);
  }
  if (event.type !== 'bottle') {
    return 0;
  }
  const details = parseBottleNotes(event.notes);
  if (details.source !== 'fridge' && details.source !== 'freezer') {
    return 0;
  }
  const oz = Number(event.value ?? 0);
  return Number.isFinite(oz) && oz > 0 ? oz : 0;
}

type StashUnit = {
  oz: number;
  createdAtMs: number;
  location: StashLocation | 'unknown';
};

export function summarizeStashInventory(
  events: Pick<TrackerEvent, 'type' | 'notes' | 'value' | 'startedAt'>[],
  now = new Date(),
): StashInventorySummary {
  const queue: StashUnit[] = [];
  const additionsBySession = new Map<string, number>();
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  let unmatchedUsageOz = 0;

  function consumeFromQueue(
    remaining: number,
    acceptedLocations: Array<StashLocation | 'unknown'>,
  ): number {
    for (const unit of queue) {
      if (remaining <= 0) {
        break;
      }
      if (!acceptedLocations.includes(unit.location)) {
        continue;
      }
      const consumed = Math.min(unit.oz, remaining);
      unit.oz -= consumed;
      remaining -= consumed;
    }
    return remaining;
  }

  sortedEvents.forEach(event => {
    if (event.type === 'pump') {
      const details = parsePumpNotes(event.notes);
      if (details.stashCount <= 0 || details.stashOzPerBottle == null) {
        return;
      }
      const location = details.stashLocation ?? 'unknown';
      for (let i = 0; i < details.stashCount; i++) {
        queue.push({
          oz: details.stashOzPerBottle,
          createdAtMs: new Date(event.startedAt).getTime(),
          location,
        });
      }
      additionsBySession.set(
        event.startedAt,
        (additionsBySession.get(event.startedAt) ?? 0) + details.stashCount,
      );
      return;
    }
    if (event.type !== 'bottle') {
      return;
    }
    const bottle = parseBottleNotes(event.notes);
    if (bottle.source !== 'fridge' && bottle.source !== 'freezer') {
      return;
    }
    let remaining = Number(event.value ?? 0);
    remaining = consumeFromQueue(remaining, [bottle.source, 'unknown']);
    if (remaining > 0) {
      const fallbackLocation: StashLocation = bottle.source === 'fridge' ? 'freezer' : 'fridge';
      remaining = consumeFromQueue(remaining, [fallbackLocation]);
    }
    unmatchedUsageOz += remaining;
  });

  const remainingUnits = queue.filter(unit => unit.oz > 0);
  const nowMs = now.getTime();
  let oldestAgeDays: number | null = null;
  let oldestLocation: StashLocation | 'unknown' | null = null;

  const summary = remainingUnits.reduce<StashInventorySummary>(
    (acc, unit) => {
      const ageDays = Math.floor((nowMs - unit.createdAtMs) / (24 * 60 * 60_000));
      if (oldestAgeDays == null || ageDays > oldestAgeDays) {
        oldestAgeDays = ageDays;
        oldestLocation = unit.location;
      }
      if (unit.location === 'fridge') {
        acc.fridgeOz += unit.oz;
        acc.fridgeBottles += 1;
        if (ageDays >= 4) {
          acc.expiredBottles += 1;
        } else if (ageDays >= 3) {
          acc.expiringSoonBottles += 1;
        }
      } else if (unit.location === 'freezer') {
        acc.freezerOz += unit.oz;
        acc.freezerBottles += 1;
        if (ageDays >= 180) {
          acc.expiredBottles += 1;
        } else if (ageDays >= 170) {
          acc.expiringSoonBottles += 1;
        }
      } else {
        acc.unknownOz += unit.oz;
      }
      acc.totalOz += unit.oz;
      acc.totalBottles += 1;
      return acc;
    },
    {
      totalOz: 0,
      totalBottles: 0,
      totalSessions: 0,
      fridgeOz: 0,
      freezerOz: 0,
      fridgeBottles: 0,
      freezerBottles: 0,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: null,
      oldestLocation: null,
      unmatchedUsageOz,
    },
  );

  summary.totalSessions = new Set(
    remainingUnits.map(unit => `${unit.createdAtMs}:${unit.location}`),
  ).size;
  summary.oldestAgeDays = oldestAgeDays;
  summary.oldestLocation = oldestLocation;
  return summary;
}
