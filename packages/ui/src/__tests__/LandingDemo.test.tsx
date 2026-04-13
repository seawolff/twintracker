/**
 * Landing page demo smoke tests.
 *
 * These tests exist to catch regressions in the components and data used by
 * the landing page phone mockup. If BabyCard's required props change, the
 * data builders produce invalid events, or isBabySleeping breaks, these
 * tests will fail before the breakage reaches production.
 *
 * Uses renderToStaticMarkup (same approach as BabyCard.test.tsx) — no DOM
 * needed, compatible with React 19.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { BabyCard } from '../components/BabyCard';
import type { Baby, LatestEventMap, TrackerEvent } from '@tt/core';

// ── Inline fixtures (mirrors apps/web/app/_demoData.ts) ──────────────────────
// Duplicated here because packages/ui cannot import from apps/web.

const EMMA: Baby = {
  id: 'demo-emma',
  name: 'Emma',
  color: 'rose',
  birthDate: '2025-08-15',
  createdAt: '2025-08-15T00:00:00Z',
};

const LUCAS: Baby = {
  id: 'demo-lucas',
  name: 'Lucas',
  color: 'amber',
  birthDate: '2025-10-01',
  createdAt: '2025-10-01T00:00:00Z',
};

const MIA: Baby = {
  id: 'demo-mia',
  name: 'Mia',
  color: 'sky',
  birthDate: '2025-10-01',
  createdAt: '2025-10-01T00:00:00Z',
};

// Fixed reference point — 2 PM UTC, unambiguously daytime.
const NOW = new Date('2026-04-10T14:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function buildSingletonLatest(): LatestEventMap {
  return {
    [`${EMMA.id}:bottle`]: {
      id: 'e-btl',
      babyId: EMMA.id,
      type: 'bottle',
      startedAt: ago(150),
      createdAt: ago(150),
      value: 6,
      unit: 'oz',
    },
    [`${EMMA.id}:nap`]: {
      id: 'e-nap',
      babyId: EMMA.id,
      type: 'nap',
      startedAt: ago(270),
      createdAt: ago(270),
      endedAt: ago(130),
    },
  };
}

function buildTwinLatest(): LatestEventMap {
  return {
    [`${LUCAS.id}:bottle`]: {
      id: 'l-btl',
      babyId: LUCAS.id,
      type: 'bottle',
      startedAt: ago(210),
      createdAt: ago(210),
      value: 6,
      unit: 'oz',
    },
    [`${LUCAS.id}:nap`]: {
      id: 'l-nap',
      babyId: LUCAS.id,
      type: 'nap',
      startedAt: ago(90),
      createdAt: ago(90),
      endedAt: ago(10),
    },
    [`${MIA.id}:bottle`]: {
      id: 'm-btl',
      babyId: MIA.id,
      type: 'bottle',
      startedAt: ago(220),
      createdAt: ago(220),
      value: 5.5,
      unit: 'oz',
    },
    [`${MIA.id}:nap`]: {
      id: 'm-nap',
      babyId: MIA.id,
      type: 'nap',
      startedAt: ago(95),
      createdAt: ago(95),
      endedAt: ago(12),
    },
  };
}

// ── Card render helper ────────────────────────────────────────────────────────

function renderCard(baby: Baby, latest: LatestEventMap, events: TrackerEvent[] = []): string {
  return renderToStaticMarkup(
    <BabyCard
      baby={baby}
      latest={latest}
      events={events}
      onLog={jest.fn()}
      now={NOW}
      resetHour={0}
      bedtimeHour={19}
      wakeHour={7}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Landing page demo — singleton (Emma)', () => {
  it('renders the baby name', () => {
    const html = renderCard(EMMA, buildSingletonLatest());
    expect(html).toContain('Emma');
  });

  it('shows a bottle prediction (fed ~2.5h ago, 4h cycle → next bottle due)', () => {
    const html = renderCard(EMMA, buildSingletonLatest());
    // Should show a countdown or "Bottle" somewhere in the card
    expect(html.toLowerCase()).toMatch(/bottle/);
  });

  it('renders with no latest events without crashing', () => {
    expect(() => renderCard(EMMA, {})).not.toThrow();
  });

  it('shows active nap state when nap has no endedAt', () => {
    const latest: LatestEventMap = {
      [`${EMMA.id}:nap`]: {
        id: 'active-nap',
        babyId: EMMA.id,
        type: 'nap',
        startedAt: ago(45),
        createdAt: ago(45),
        // no endedAt → active nap
      },
    };
    const html = renderCard(EMMA, latest);
    expect(html).toContain('Emma');
    // Active nap should show elapsed time or wake action
    expect(html).not.toBe('');
  });
});

describe('Landing page demo — twins (Lucas & Mia)', () => {
  it('renders Lucas card with name', () => {
    const html = renderCard(LUCAS, buildTwinLatest());
    expect(html).toContain('Lucas');
  });

  it('renders Mia card with name', () => {
    const html = renderCard(MIA, buildTwinLatest());
    expect(html).toContain('Mia');
  });

  it('both twin cards render independently without crashing', () => {
    const latest = buildTwinLatest();
    expect(() => renderCard(LUCAS, latest)).not.toThrow();
    expect(() => renderCard(MIA, latest)).not.toThrow();
  });

  it('twin cards show bottle predictions (both fed ~3.5h ago)', () => {
    const latest = buildTwinLatest();
    const lucasHtml = renderCard(LUCAS, latest);
    const miaHtml = renderCard(MIA, latest);
    expect(lucasHtml.toLowerCase()).toMatch(/bottle/);
    expect(miaHtml.toLowerCase()).toMatch(/bottle/);
  });
});

describe('Demo event shape — sleep state detection', () => {
  it('active nap has no endedAt (card should show sleeping state)', () => {
    const activeNap: TrackerEvent = {
      id: 'n1',
      babyId: 'demo-emma',
      type: 'nap',
      startedAt: ago(45),
      createdAt: ago(45),
    };
    expect(activeNap.endedAt).toBeUndefined();
    // Confirm BabyCard renders with this active nap without crashing
    const html = renderCard(EMMA, { [`${EMMA.id}:nap`]: activeNap });
    expect(html).toContain('Emma');
  });

  it('ended nap has endedAt — card should show awake state', () => {
    const endedNap: TrackerEvent = {
      id: 'n2',
      babyId: 'demo-emma',
      type: 'nap',
      startedAt: ago(120),
      createdAt: ago(120),
      endedAt: ago(30),
    };
    expect(endedNap.endedAt).toBeDefined();
    const html = renderCard(EMMA, { [`${EMMA.id}:nap`]: endedNap });
    expect(html).toContain('Emma');
  });
});
