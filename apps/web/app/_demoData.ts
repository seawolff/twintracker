/**
 * Landing page demo data builders.
 * Exported separately so LandingDemo.test.tsx can import and validate them
 * without pulling in the full page module (which is a Next.js route and
 * cannot have extra named exports).
 *
 * All builders take a fixed `nowMs` reference (DEMO_NOW.getTime()) so both SSR
 * and client produce identical output — no hydration mismatch.
 */
import type { Baby, LatestEventMap, TrackerEvent } from '@tt/core';

// Demo babies born ~6 months before the fixed DEMO_NOW (2026-04-10T18:00:00Z)
// → Stage 2 (≥16 weeks), bedtime-stretch narrative at 6pm.
export const DEMO_EMMA: Baby = {
  id: 'demo-emma',
  name: 'Emma',
  color: 'rose',
  birthDate: '2025-10-01',
  createdAt: '2025-10-01T00:00:00Z',
};

export const DEMO_LUCAS: Baby = {
  id: 'demo-lucas',
  name: 'Lucas',
  color: 'amber',
  birthDate: '2025-11-15',
  createdAt: '2025-11-15T00:00:00Z',
};

export const DEMO_MIA: Baby = {
  id: 'demo-mia',
  name: 'Mia',
  color: 'sky',
  birthDate: '2025-11-15',
  createdAt: '2025-11-15T00:00:00Z',
};

function mkEvent(
  id: string,
  babyId: string,
  type: TrackerEvent['type'],
  startedAt: string,
  extra?: Partial<TrackerEvent>,
): TrackerEvent {
  return { id, babyId, type, startedAt, createdAt: startedAt, ...extra };
}

/** True when the most-recent nap or sleep event for this baby has no endedAt. */
export function isBabySleeping(babyId: string, latestMap: LatestEventMap): boolean {
  const nap = latestMap[`${babyId}:nap`];
  const sleep = latestMap[`${babyId}:sleep`];
  const candidates = [nap, sleep].filter((e): e is TrackerEvent => Boolean(e));
  if (candidates.length === 0) {
    return false;
  }
  const most = candidates.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  return !most.endedAt;
}

export function buildSingletonLatest(nowMs: number): LatestEventMap {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
  return {
    // 210 min before DEMO_NOW (6:30 PM) = 3:00 PM exactly.
    // normalNextFeedMs = 3pm + 4h feed interval = 7pm = bedtime.
    // computePredictions uses strict ">", so 7pm === 7pm skips the bedtime snap →
    // bottle pill remaining = 7pm − 6:30pm = 30min, matching the bedtime countdown.
    [`${DEMO_EMMA.id}:bottle`]: mkEvent('e-l-btl', DEMO_EMMA.id, 'bottle', ago(210), {
      value: 6,
      unit: 'oz',
    }),
    [`${DEMO_EMMA.id}:nap`]: mkEvent('e-l-nap', DEMO_EMMA.id, 'nap', ago(270), {
      endedAt: ago(130),
    }),
    [`${DEMO_EMMA.id}:diaper`]: mkEvent('e-l-dpr', DEMO_EMMA.id, 'diaper', ago(80)),
  };
}

// Extended event list — more rows = visible Clear-app gradient in history demo.
export function buildSingletonEvents(nowMs: number): TrackerEvent[] {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
  return [
    mkEvent('e-h-dpr1', DEMO_EMMA.id, 'diaper', ago(80), { loggedByName: 'Alex' }),
    // Matches buildSingletonLatest: bottle at ago(210) = 3:00 PM
    mkEvent('e-h-btl2', DEMO_EMMA.id, 'bottle', ago(210), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('e-h-nap1', DEMO_EMMA.id, 'nap', ago(270), { endedAt: ago(130), loggedByName: 'Alex' }),
    mkEvent('e-h-btl1', DEMO_EMMA.id, 'bottle', ago(340), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('e-h-dpr2', DEMO_EMMA.id, 'diaper', ago(380), { loggedByName: 'Alex' }),
    mkEvent('e-h-nap2', DEMO_EMMA.id, 'nap', ago(500), { endedAt: ago(390), loggedByName: 'Sam' }),
    mkEvent('e-h-btl0', DEMO_EMMA.id, 'bottle', ago(520), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
    mkEvent('e-h-dpr3', DEMO_EMMA.id, 'diaper', ago(600), { loggedByName: 'Sam' }),
    mkEvent('e-h-nap3', DEMO_EMMA.id, 'nap', ago(720), { endedAt: ago(610), loggedByName: 'Alex' }),
    mkEvent('e-h-btl3', DEMO_EMMA.id, 'bottle', ago(740), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('e-h-dpr4', DEMO_EMMA.id, 'diaper', ago(800), { loggedByName: 'Alex' }),
    mkEvent('e-h-nap4', DEMO_EMMA.id, 'nap', ago(900), { endedAt: ago(810), loggedByName: 'Sam' }),
    mkEvent('e-h-btl4', DEMO_EMMA.id, 'bottle', ago(920), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
    mkEvent('e-h-dpr5', DEMO_EMMA.id, 'diaper', ago(980), { loggedByName: 'Sam' }),
    mkEvent('e-h-btl5', DEMO_EMMA.id, 'bottle', ago(1060), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
  ];
}

export function buildTwinLatest(nowMs: number): LatestEventMap {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
  return {
    [`${DEMO_LUCAS.id}:bottle`]: mkEvent('a-l-btl', DEMO_LUCAS.id, 'bottle', ago(210), {
      value: 6,
      unit: 'oz',
    }),
    [`${DEMO_LUCAS.id}:nap`]: mkEvent('a-l-nap', DEMO_LUCAS.id, 'nap', ago(90), {
      endedAt: ago(10),
    }),
    [`${DEMO_LUCAS.id}:diaper`]: mkEvent('a-l-dpr', DEMO_LUCAS.id, 'diaper', ago(60)),
    [`${DEMO_MIA.id}:bottle`]: mkEvent('g-l-btl', DEMO_MIA.id, 'bottle', ago(220), {
      value: 5.5,
      unit: 'oz',
    }),
    [`${DEMO_MIA.id}:nap`]: mkEvent('g-l-nap', DEMO_MIA.id, 'nap', ago(95), {
      endedAt: ago(12),
    }),
    [`${DEMO_MIA.id}:diaper`]: mkEvent('g-l-dpr', DEMO_MIA.id, 'diaper', ago(70)),
  };
}

export function buildTwinEvents(nowMs: number): TrackerEvent[] {
  const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
  return [
    mkEvent('a-h-dpr1', DEMO_LUCAS.id, 'diaper', ago(60), { loggedByName: 'Alex' }),
    mkEvent('g-h-dpr1', DEMO_MIA.id, 'diaper', ago(70), { loggedByName: 'Sam' }),
    mkEvent('a-h-nap1', DEMO_LUCAS.id, 'nap', ago(90), { endedAt: ago(10), loggedByName: 'Sam' }),
    mkEvent('g-h-nap1', DEMO_MIA.id, 'nap', ago(95), { endedAt: ago(12), loggedByName: 'Alex' }),
    mkEvent('a-h-btl1', DEMO_LUCAS.id, 'bottle', ago(210), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
    mkEvent('g-h-btl1', DEMO_MIA.id, 'bottle', ago(220), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('a-h-dpr2', DEMO_LUCAS.id, 'diaper', ago(300), { loggedByName: 'Sam' }),
    mkEvent('g-h-dpr2', DEMO_MIA.id, 'diaper', ago(310), { loggedByName: 'Alex' }),
    mkEvent('a-h-nap2', DEMO_LUCAS.id, 'nap', ago(420), {
      endedAt: ago(330),
      loggedByName: 'Alex',
    }),
    mkEvent('g-h-nap2', DEMO_MIA.id, 'nap', ago(425), { endedAt: ago(335), loggedByName: 'Sam' }),
    mkEvent('a-h-btl0', DEMO_LUCAS.id, 'bottle', ago(430), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('g-h-btl0', DEMO_MIA.id, 'bottle', ago(440), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
    mkEvent('a-h-dpr3', DEMO_LUCAS.id, 'diaper', ago(540), { loggedByName: 'Alex' }),
    mkEvent('g-h-dpr3', DEMO_MIA.id, 'diaper', ago(550), { loggedByName: 'Sam' }),
    mkEvent('a-h-nap3', DEMO_LUCAS.id, 'nap', ago(660), {
      endedAt: ago(570),
      loggedByName: 'Sam',
    }),
    mkEvent('g-h-nap3', DEMO_MIA.id, 'nap', ago(665), { endedAt: ago(575), loggedByName: 'Alex' }),
    mkEvent('a-h-btl2', DEMO_LUCAS.id, 'bottle', ago(680), {
      value: 6,
      unit: 'oz',
      loggedByName: 'Alex',
    }),
    mkEvent('g-h-btl2', DEMO_MIA.id, 'bottle', ago(690), {
      value: 5.5,
      unit: 'oz',
      loggedByName: 'Sam',
    }),
    mkEvent('a-h-dpr4', DEMO_LUCAS.id, 'diaper', ago(780), { loggedByName: 'Sam' }),
    mkEvent('g-h-dpr4', DEMO_MIA.id, 'diaper', ago(790), { loggedByName: 'Alex' }),
  ];
}
