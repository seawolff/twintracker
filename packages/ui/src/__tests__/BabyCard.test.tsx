/**
 * BabyCard component tests.
 * Verifies the card renders correctly with each event type in history,
 * shows the correct action buttons, and reflects active/inactive nap state.
 * Uses renderToStaticMarkup (react-dom/server) — compatible with React 19.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { BabyCard } from '../components/BabyCard';
import type { Baby, EventType, LatestEventMap, TrackerEvent } from '@tt/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BABY: Baby = {
  id: 'b1',
  name: 'John',
  color: 'amber',
  createdAt: '2026-01-01T00:00:00Z',
};

/** Stage 2 baby (6 months old) — for tests that expect Nap vs Sleep button distinction. */
const STAGE2_BABY: Baby = { ...BABY, birthDate: '2025-09-18' };

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

function renderCard(
  events: TrackerEvent[],
  latest: LatestEventMap = {},
  baby: Baby = BABY,
  extraProps: { householdNightMode?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <BabyCard
      baby={baby}
      latest={latest}
      events={events}
      onLog={jest.fn()}
      onSetAlarm={jest.fn()}
      now={NOW}
      resetHour={0}
      bedtimeHour={20}
      wakeHour={6}
      {...extraProps}
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

  it('shows Nap button when no active nap (Stage 2+ baby)', () => {
    expect(renderCard([], {}, STAGE2_BABY)).toContain('log_sheet.types.nap');
  });

  it('shows Wake button when nap is active (no endedAt)', () => {
    const napEvent = makeEvent({ type: 'nap' }); // no endedAt = active
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    expect(renderCard([napEvent], latest)).toContain('home.action_wake');
  });

  it('shows Nap button again after nap ends (Stage 2+ baby)', () => {
    const napEvent = makeEvent({ type: 'nap', endedAt: '2026-03-18T09:45:00Z' });
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    const html = renderCard([napEvent], latest, STAGE2_BABY);
    expect(html).toContain('log_sheet.types.nap');
    expect(html).not.toContain('home.action_wake');
  });

  it('renders triage strip (icon-only cells, shows — when no events)', () => {
    // TriageStrip uses icon components (null in tests) + elapsed values.
    // With no events all three cells show '—'.
    const html = renderCard([]);
    expect(html).toContain('———');
  });

  it('does not show milestone history on the baby card when milestone events exist', () => {
    const milestone = makeEvent({
      type: 'milestone',
      notes: 'milestone:key=first_word&detail=with+dada',
    });
    const html = renderCard([milestone]);
    expect(html).not.toContain('home.recent_milestones');
    expect(html).not.toContain('milestones.items.first_word');
  });

  it('renders the sleep training badge while baby is sleeping and training is enabled', () => {
    const sleepEvent = makeEvent({ type: 'sleep' });
    const latest: LatestEventMap = { 'b1:sleep': sleepEvent };
    const html = renderToStaticMarkup(
      <BabyCard
        baby={BABY}
        latest={latest}
        events={[sleepEvent]}
        onLog={jest.fn()}
        onSetAlarm={jest.fn()}
        now={NOW}
        sleepTraining
      />,
    );
    expect(html).toContain('settings.sleep_training_wait');
  });
});

// ── Tests — one per event type ────────────────────────────────────────────────

describe('BabyCard — renders without crash for each event type', () => {
  const EVENT_TYPES: EventType[] = [
    'bottle',
    'nursing',
    'pump',
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
    pump: { value: 4, unit: 'oz', notes: 'both', endedAt: '2026-03-18T09:20:00Z' },
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
  it('shows feed count and oz progress in triage strip after a bottle is logged', () => {
    const bottleEvent = makeEvent({ type: 'bottle', value: 4, unit: 'oz' });
    const latest: LatestEventMap = { 'b1:bottle': bottleEvent };
    const html = renderCard([bottleEvent], latest);
    // Triage strip bottle cell shows "feedCount/target · Xoz" when bottle data exists
    expect(html).toMatch(/\d+\/\d+ · \d+oz/);
  });

  it('shows nursing minutes in triage strip when only nursing is logged today', () => {
    const nursingEvent = makeEvent({ type: 'nursing', value: 22, unit: 'min', notes: 'left' });
    const latest: LatestEventMap = { 'b1:nursing': nursingEvent };
    const html = renderCard([nursingEvent], latest);
    expect(html).toMatch(/\d+\/\d+ · 22m/);
    expect(html).not.toContain('oz');
  });

  it('keeps both bottle oz and nursing minutes in triage strip when both are logged today', () => {
    const bottleEvent = makeEvent({
      id: 'bottle-1',
      type: 'bottle',
      value: 10,
      unit: 'oz',
      startedAt: '2026-03-18T08:00:00Z',
      createdAt: '2026-03-18T08:00:00Z',
    });
    const nursingEvent = makeEvent({
      id: 'nursing-1',
      type: 'nursing',
      value: 22,
      unit: 'min',
      notes: 'left',
      startedAt: '2026-03-18T10:00:00Z',
      createdAt: '2026-03-18T10:00:00Z',
    });
    const latest: LatestEventMap = { 'b1:bottle': bottleEvent, 'b1:nursing': nursingEvent };
    const html = renderCard([bottleEvent, nursingEvent], latest);
    expect(html).toContain('10oz');
    expect(html).toContain('22m');
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

// ── Tests — household night-mode propagation ─────────────────────────────────

describe('BabyCard — householdNightMode', () => {
  // NOW is 2pm UTC — daytime, before bedtimeHour=20, so insight.isNight=false
  // and isBedtimeStretch=false. Without householdNightMode the button shows "Nap".

  it('shows Nap label by default at daytime for Stage 2 baby', () => {
    const html = renderCard([], {}, STAGE2_BABY);
    expect(html).toContain('log_sheet.types.nap');
    expect(html).not.toContain('log_sheet.types.sleep');
  });

  it('shows Sleep label when householdNightMode=true and baby is not napping', () => {
    const html = renderCard([], {}, STAGE2_BABY, { householdNightMode: true });
    expect(html).toContain('log_sheet.types.sleep');
    expect(html).not.toContain('log_sheet.types.nap');
  });

  it('shows Wake label (not Sleep) when this baby has an active nap, even with householdNightMode', () => {
    const napEvent = makeEvent({ type: 'nap' });
    const latest: LatestEventMap = { 'b1:nap': napEvent };
    const html = renderCard([napEvent], latest, STAGE2_BABY, { householdNightMode: true });
    expect(html).toContain('home.action_wake');
    expect(html).not.toContain('log_sheet.types.sleep');
  });

  it('shows Wake label (not Sleep) when this baby has an active sleep, even with householdNightMode', () => {
    const sleepEvent = makeEvent({ type: 'sleep' });
    const latest: LatestEventMap = { 'b1:sleep': sleepEvent };
    const html = renderCard([sleepEvent], latest, STAGE2_BABY, { householdNightMode: true });
    expect(html).toContain('home.action_wake');
    expect(html).not.toContain('log_sheet.types.sleep');
  });

  it('keeps Nap label after an early-morning wake when householdNightMode=false', () => {
    const sleepEvent = makeEvent({
      type: 'sleep',
      startedAt: '2026-03-17T23:00:00Z',
      endedAt: '2026-03-18T05:30:00Z',
      createdAt: '2026-03-17T23:00:00Z',
    });
    const latest: LatestEventMap = { 'b1:sleep': sleepEvent };
    const html = renderCard([sleepEvent], latest, STAGE2_BABY, { householdNightMode: false });
    expect(html).toContain('log_sheet.types.nap');
    expect(html).not.toContain('log_sheet.types.sleep');
  });
});
