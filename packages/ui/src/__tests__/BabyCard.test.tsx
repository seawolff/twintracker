/**
 * BabyCard component tests.
 * Verifies the card renders correctly with each event type in history,
 * shows the correct action buttons, and reflects active/inactive nap state.
 * Uses renderToStaticMarkup (react-dom/server) — compatible with React 19.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { BabyCard } from '../components/BabyCard';
import type { Baby, EventType, LatestEventMap, NapAlarm, TrackerEvent } from '@tt/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BABY: Baby = {
  id: 'b1',
  name: 'John',
  color: 'amber',
  createdAt: '2026-01-01T00:00:00Z',
};

// Fixed reference time — 2pm UTC (unambiguously daytime across UTC-8 to UTC+8).
// Using an explicit ISO string avoids timezone-dependent getHours() mismatches.
const NOW = new Date('2026-03-18T14:00:00Z');

function makeEvent(overrides: Partial<TrackerEvent>): TrackerEvent {
  return {
    id: 'e1',
    babyId: 'b1',
    type: 'bottle',
    startedAt: '2026-03-18T09:00:00Z',
    createdAt: '2026-03-18T09:00:00Z',
    ...overrides,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function renderCard(events: TrackerEvent[], latest: LatestEventMap = {}): string {
  return renderToStaticMarkup(
    <BabyCard
      baby={BABY}
      latest={latest}
      events={events}
      onLog={jest.fn()}
      onSetAlarm={jest.fn()}
      now={NOW}
      resetHour={0}
      bedtimeHour={20}
      wakeHour={6}
    />,
  );
}

// ── Tests — structural ────────────────────────────────────────────────────────

describe('BabyCard — structure', () => {
  it('always shows the baby name', () => {
    expect(renderCard([])).toContain('John');
  });

  it('always shows Feed action button', () => {
    // i18n stub returns keys as-is
    expect(renderCard([])).toContain('home.action_feed');
  });

  it('always shows Diaper action button', () => {
    expect(renderCard([])).toContain('log_sheet.types.diaper');
  });

  it('shows Nap button when no active nap', () => {
    expect(renderCard([])).toContain('log_sheet.types.nap');
  });

  it('shows Wake button when nap is active (no endedAt)', () => {
    const napEvent = makeEvent({ type: 'nap' }); // no endedAt = active
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    expect(renderCard([napEvent], latest)).toContain('home.action_wake');
  });

  it('shows Nap button again after nap ends', () => {
    const napEvent = makeEvent({ type: 'nap', endedAt: '2026-03-18T09:45:00Z' });
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    const html = renderCard([napEvent], latest);
    expect(html).toContain('log_sheet.types.nap');
    expect(html).not.toContain('home.action_wake');
  });

  it('renders triage strip (icon-only cells, shows — when no events)', () => {
    // TriageStrip uses icon components (null in tests) + elapsed values.
    // With no events all three cells show '—'.
    const html = renderCard([]);
    expect(html).toContain('———');
  });
});

// ── Tests — one per event type ────────────────────────────────────────────────

describe('BabyCard — renders without crash for each event type', () => {
  const EVENT_TYPES: EventType[] = [
    'bottle',
    'nursing',
    'nap',
    'sleep',
    'diaper',
    'medicine',
    'food',
    'milestone',
  ];

  const EVENT_VALUES: Partial<Record<EventType, Partial<TrackerEvent>>> = {
    bottle: { value: 4, unit: 'oz' },
    nursing: { value: 15, unit: 'min' },
    nap: { endedAt: '2026-03-18T09:45:00Z' },
    sleep: { endedAt: '2026-03-18T09:00:00Z' },
    diaper: { notes: 'wet' },
    medicine: { notes: 'Tylenol 2.5ml' },
    food: { notes: 'banana puree' },
    milestone: { notes: 'First smile' },
  };

  EVENT_TYPES.forEach(type => {
    it(`renders with a ${type} event in history`, () => {
      const event = makeEvent({ type, ...EVENT_VALUES[type] });
      const latest: LatestEventMap = { [`b1:${type}`]: event };
      const html = renderCard([event], latest);
      // Baby name always visible
      expect(html).toContain('John');
      // Card renders without throwing (non-empty output)
      expect(html.length).toBeGreaterThan(0);
    });
  });
});

// ── Tests — alarm badge ───────────────────────────────────────────────────────

describe('BabyCard — alarm badge', () => {
  const ALARM: NapAlarm = {
    id: 'alarm-1',
    babyId: 'b1',
    householdId: 'hh-1',
    firesAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(), // fires in 10 min
    durationMs: 15 * 60_000,
    label: 'Nap check',
    createdAt: NOW.toISOString(),
  };

  it('renders countdown badge when activeAlarm is provided', () => {
    const html = renderToStaticMarkup(
      <BabyCard
        baby={BABY}
        latest={{}}
        events={[]}
        onLog={jest.fn()}
        onSetAlarm={jest.fn()}
        activeAlarm={ALARM}
        onDismissAlarm={jest.fn()}
        now={NOW}
      />,
    );
    // Badge shows countdown — format is "Xm YYs"
    expect(html).toMatch(/\d+m \d+s/);
  });

  it('does not render countdown badge when no activeAlarm', () => {
    const html = renderCard([]);
    expect(html).not.toMatch(/\d+m \d+s/);
  });
});

// ── Tests — sleeping state dims irrelevant controls ──────────────────────────

describe('BabyCard — sleeping state', () => {
  function renderSleeping() {
    const napEvent = makeEvent({ type: 'nap' }); // no endedAt = active
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    return renderCard([napEvent], latest);
  }

  it('disables Feed and Diaper buttons while nap is active', () => {
    // react-native-web renders disabled Pressable with aria-disabled="true"
    expect(renderSleeping()).toContain('aria-disabled="true"');
  });

  it('still renders Feed and Diaper buttons while nap is active', () => {
    const html = renderSleeping();
    expect(html).toContain('home.action_feed');
    expect(html).toContain('log_sheet.types.diaper');
  });

  it('Feed and Diaper buttons are not disabled when no nap is active', () => {
    expect(renderCard([])).not.toContain('aria-disabled="true"');
  });
});

// ── Tests — event state reflected in card ─────────────────────────────────────

describe('BabyCard — event state', () => {
  it('shows time-ago info after a bottle is logged', () => {
    const bottleEvent = makeEvent({ type: 'bottle', value: 4, unit: 'oz' });
    const latest: LatestEventMap = { 'b1:bottle': bottleEvent };
    const html = renderCard([bottleEvent], latest);
    // The triage strip should show fed time ago (e.g. "1h 0m ago")
    expect(html).toMatch(/\d+h|\d+m/);
  });

  it('reflects active nap in triage strip sleep status', () => {
    const napEvent = makeEvent({ type: 'nap' });
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    const html = renderCard([napEvent], latest);
    expect(html).toMatch(/\d+h|\d+m/);
  });

  it('reflects diaper change in triage strip', () => {
    const diaperEvent = makeEvent({ type: 'diaper', notes: 'wet' });
    const latest: LatestEventMap = { 'b1:diaper': diaperEvent };
    const html = renderCard([diaperEvent], latest);
    expect(html).toMatch(/\d+h|\d+m/);
  });
});
