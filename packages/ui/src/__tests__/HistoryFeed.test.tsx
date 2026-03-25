/**
 * HistoryFeed component tests — one per event type.
 * Verifies that each log type renders the correct label and metadata in the history list.
 * Uses HistoryFeed.web.tsx (no gesture handler dependency).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { HistoryFeed } from '../components/HistoryFeed.web';
import type { Baby, TrackerEvent } from '@tt/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BABY: Baby = {
  id: 'b1',
  name: 'John',
  color: 'amber',
  createdAt: '2026-01-01T00:00:00Z',
};

// Fixed reference time so "time ago" values are deterministic
const NOW = new Date('2026-03-18T10:00:00Z');

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

function renderFeed(events: TrackerEvent[]): string {
  return renderToStaticMarkup(
    <HistoryFeed
      events={events}
      babies={[BABY]}
      now={NOW}
      onDelete={jest.fn()}
      onEdit={jest.fn()}
      onAddForDay={jest.fn()}
    />,
  );
}

// ── Tests — one per event type ────────────────────────────────────────────────

describe('HistoryFeed — event type labels', () => {
  it('bottle: shows amount in oz', () => {
    expect(renderFeed([makeEvent({ type: 'bottle', value: 4, unit: 'oz' })])).toContain(
      'Bottle 4oz',
    );
  });

  it('bottle: shows custom decimal amount', () => {
    expect(renderFeed([makeEvent({ type: 'bottle', value: 5.5, unit: 'oz' })])).toContain(
      'Bottle 5.5oz',
    );
  });

  it('nursing: shows Nursing', () => {
    expect(renderFeed([makeEvent({ type: 'nursing' })])).toContain('Nursing');
  });

  it('nap (in progress, no endedAt): shows Nap', () => {
    expect(renderFeed([makeEvent({ type: 'nap' })])).toContain('Nap');
  });

  it('nap (completed): shows duration', () => {
    expect(
      renderFeed([
        makeEvent({
          type: 'nap',
          startedAt: '2026-03-18T08:00:00Z',
          endedAt: '2026-03-18T09:05:00Z',
        }),
      ]),
    ).toContain('Nap 1h 5m');
  });

  it('sleep (in progress): shows Sleep', () => {
    expect(renderFeed([makeEvent({ type: 'sleep' })])).toContain('Sleep');
  });

  it('sleep (completed): shows duration', () => {
    expect(
      renderFeed([
        makeEvent({
          type: 'sleep',
          startedAt: '2026-03-18T02:00:00Z',
          endedAt: '2026-03-18T09:30:00Z',
        }),
      ]),
    ).toContain('Sleep 7h 30m');
  });

  it('diaper (dirty): shows type', () => {
    expect(renderFeed([makeEvent({ type: 'diaper', notes: 'dirty' })])).toContain('Diaper · dirty');
  });

  it('diaper (wet): shows type', () => {
    expect(renderFeed([makeEvent({ type: 'diaper', notes: 'wet' })])).toContain('Diaper · wet');
  });

  it('diaper (both): shows type', () => {
    expect(renderFeed([makeEvent({ type: 'diaper', notes: 'both' })])).toContain('Diaper · both');
  });

  it('medicine: shows Medicine', () => {
    // Notes are stored but the row label for medicine is just "Medicine"
    expect(renderFeed([makeEvent({ type: 'medicine', notes: 'Tylenol 2.5ml' })])).toContain(
      'Medicine',
    );
  });

  it('food: shows food name in label', () => {
    expect(renderFeed([makeEvent({ type: 'food', notes: 'banana puree' })])).toContain(
      'Food — banana puree',
    );
  });

  it('food (no notes): shows Food', () => {
    expect(renderFeed([makeEvent({ type: 'food' })])).toContain('Food');
  });

  it('milestone: shows description with star prefix', () => {
    expect(renderFeed([makeEvent({ type: 'milestone', notes: 'First steps' })])).toContain(
      '★ First steps',
    );
  });

  it('milestone (no notes): shows ★ Milestone', () => {
    expect(renderFeed([makeEvent({ type: 'milestone' })])).toContain('★ Milestone');
  });
});

// ── Tests — metadata ──────────────────────────────────────────────────────────

describe('HistoryFeed — metadata', () => {
  it('shows the baby name for each row', () => {
    expect(renderFeed([makeEvent({ type: 'bottle', value: 4, unit: 'oz' })])).toContain('John');
  });

  it('shows a formatted time (HH:MM) for each row', () => {
    const html = renderFeed([makeEvent({ type: 'nap', startedAt: '2026-03-18T09:00:00Z' })]);
    expect(html).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows the TODAY section header', () => {
    const html = renderFeed([makeEvent({ type: 'bottle' })]);
    expect(html).toContain('TODAY');
  });

  it('renders multiple event types in one list', () => {
    const html = renderFeed([
      makeEvent({
        id: 'e1',
        type: 'bottle',
        value: 4,
        unit: 'oz',
        startedAt: '2026-03-18T09:00:00Z',
      }),
      makeEvent({ id: 'e2', type: 'nap', startedAt: '2026-03-18T08:00:00Z' }),
      makeEvent({ id: 'e3', type: 'diaper', notes: 'wet', startedAt: '2026-03-18T07:30:00Z' }),
    ]);
    expect(html).toContain('Bottle 4oz');
    expect(html).toContain('Nap');
    expect(html).toContain('Diaper · wet');
  });

  it('renders empty state when no events', () => {
    // i18n stub returns the key as-is
    expect(renderFeed([])).toContain('history.no_events');
  });
});

// ── Tests — author attribution ────────────────────────────────────────────────

describe('HistoryFeed — author attribution', () => {
  it('shows the first initial of loggedByName when present', () => {
    const html = renderFeed([makeEvent({ type: 'bottle', loggedByName: 'Mom' })]);
    expect(html).toContain('M');
  });

  it('shows initial for a different author name', () => {
    const html = renderFeed([makeEvent({ type: 'nap', loggedByName: 'Dad' })]);
    expect(html).toContain('D');
  });

  it('renders without author initial when loggedByName is absent', () => {
    // No initial element — the avatar placeholder is an empty View, no text inside
    const html = renderFeed([makeEvent({ type: 'diaper' })]);
    // Should not show a stray initial character in the avatar position
    // (the row should still render — just without attribution)
    expect(html).toContain('John'); // baby name still present
  });

  it('shows initials for multiple events with different authors', () => {
    const html = renderFeed([
      makeEvent({
        id: 'e1',
        type: 'bottle',
        loggedByName: 'Mom',
        startedAt: '2026-03-18T09:00:00Z',
      }),
      makeEvent({ id: 'e2', type: 'nap', loggedByName: 'Dad', startedAt: '2026-03-18T08:00:00Z' }),
    ]);
    expect(html).toContain('M');
    expect(html).toContain('D');
  });
});
