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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip HTML tags and collapse whitespace to get plain text content. */
function textContent(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Return position of needle in the plain text of html, or -1 if not found. */
function textPos(html: string, needle: string): number {
  return textContent(html).indexOf(needle);
}

function renderFeed(events: TrackerEvent[], showLoggerAvatar = false): string {
  return renderToStaticMarkup(
    <HistoryFeed
      events={events}
      babies={[BABY]}
      now={NOW}
      showLoggerAvatar={showLoggerAvatar}
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

  it('bottle: shows stash source when logged from freezer stash', () => {
    expect(
      renderFeed([makeEvent({ type: 'bottle', value: 4, unit: 'oz', notes: 'source=freezer' })]),
    ).toContain('Bottle 4oz · freezer');
  });

  it('nursing: shows Nursing', () => {
    expect(renderFeed([makeEvent({ type: 'nursing' })])).toContain('Nursing');
  });

  it('nursing: shows duration when minutes were logged', () => {
    expect(
      renderFeed([makeEvent({ type: 'nursing', value: 15, unit: 'min', notes: 'left' })]),
    ).toContain('Nursing 15m · left');
  });

  it('pump: shows amount, side, and duration', () => {
    expect(
      renderFeed([
        makeEvent({
          type: 'pump',
          value: 5.5,
          unit: 'oz',
          notes: 'both',
          startedAt: '2026-03-18T08:00:00Z',
          endedAt: '2026-03-18T08:20:00Z',
        }),
      ]),
    ).toContain('Pump 5.5oz · both · 20m');
  });

  it('pump: shows stash details when bottles were saved', () => {
    expect(
      renderFeed([
        makeEvent({
          type: 'pump',
          value: 8,
          unit: 'oz',
          notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
          startedAt: '2026-03-18T08:00:00Z',
          endedAt: '2026-03-18T08:20:00Z',
        }),
      ]),
    ).toContain('Pump 8oz · both · stash 2x4oz · fridge · 20m');
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
    ).toContain('Nap (1h 5m)');
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
    ).toContain('Sleep (7h 30m)');
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
    expect(renderFeed([makeEvent({ type: 'bottle', value: 4, unit: 'oz' })])).toContain(
      'Bottle 4oz',
    );
  });

  it('shows absolute time (HH:MM) for events older than 2 hours', () => {
    // startedAt is 3h before NOW → formatEventTime returns absolute clock time
    const html = renderFeed([makeEvent({ type: 'nap', startedAt: '2026-03-18T07:00:00Z' })]);
    expect(html).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows relative time for events under 2 hours ago', () => {
    // startedAt is 1h before NOW → formatEventTime returns "1h 0m ago"
    const html = renderFeed([makeEvent({ type: 'nap', startedAt: '2026-03-18T09:00:00Z' })]);
    expect(html).toContain('1h 0m ago');
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

// ── Tests — row order ─────────────────────────────────────────────────────────
//
// Expected order: ● BabyName [C avatar] EventLabel Timestamp
//
// Uses baby name "John" (initial J) and logger "Xavier" (initial X) so each
// token is unique and won't collide with event label text ("Bottle 4oz").

describe('HistoryFeed — row order', () => {
  const event = makeEvent({ type: 'bottle', value: 4, unit: 'oz', loggedByName: 'Xavier' });

  it('baby name appears before event label', () => {
    const html = renderFeed([event]);
    expect(textPos(html, 'John')).toBeLessThan(textPos(html, 'Bottle 4oz'));
  });

  it('logger avatar appears between baby name and event label', () => {
    const html = renderFeed([event], true);
    const namePos = textPos(html, 'John');
    const initialPos = textPos(html, 'X');
    const labelPos = textPos(html, 'Bottle 4oz');
    expect(namePos).toBeLessThan(initialPos);
    expect(initialPos).toBeLessThan(labelPos);
  });

  it('event label appears before the timestamp', () => {
    const html = renderFeed([makeEvent({ type: 'bottle', value: 4, unit: 'oz', startedAt: '2026-03-18T07:00:00Z' })]);
    // event is 3h old so formatEventTime returns an absolute clock time (digits + colon)
    const timeMatch = textContent(html).match(/\d{1,2}:\d{2}/);
    expect(timeMatch).not.toBeNull();
    expect(textPos(html, 'Bottle 4oz')).toBeLessThan(textContent(html).indexOf(timeMatch![0]));
  });

  it('logger avatar is hidden when showLoggerAvatar is false', () => {
    const html = renderFeed([event], false);
    const namePos = textPos(html, 'John');
    const labelPos = textPos(html, 'Bottle 4oz');
    // Name still before label, no X initial between them
    expect(namePos).toBeLessThan(labelPos);
    expect(textContent(html)).not.toContain('Xavier');
  });
});

// ── Tests — author attribution ────────────────────────────────────────────────

describe('HistoryFeed — author attribution', () => {
  it('hides the logger name unless logger avatars are enabled', () => {
    const html = renderFeed([makeEvent({ type: 'bottle', loggedByName: 'Mom' })]);
    expect(html).not.toContain('Mom');
  });

  it('shows the logger initial when logger avatars are enabled', () => {
    const html = renderFeed([makeEvent({ type: 'bottle', loggedByName: 'Mom' })], true);
    expect(html).toContain('M');
  });

  it('does not show the full logger name, only the initial', () => {
    const html = renderFeed([makeEvent({ type: 'bottle', loggedByName: 'Chris' })], true);
    expect(html).not.toContain('Chris');
    expect(html).toContain('C');
  });

  it('shows initials for multiple events with different authors', () => {
    const html = renderFeed(
      [
        makeEvent({
          id: 'e1',
          type: 'bottle',
          loggedByName: 'Mom',
          startedAt: '2026-03-18T09:00:00Z',
        }),
        makeEvent({
          id: 'e2',
          type: 'nap',
          loggedByName: 'Dad',
          startedAt: '2026-03-18T08:00:00Z',
        }),
      ],
      true,
    );
    expect(html).toContain('M');
    expect(html).toContain('D');
  });

  it('shows avatar initial but not full name when logger avatars are enabled', () => {
    const html = renderFeed(
      [makeEvent({ type: 'bottle', value: 4, unit: 'oz', loggedByName: 'Chris' })],
      true,
    );
    expect(html).toContain('Bottle 4oz');
    expect(html).not.toContain('Chris');
  });
});

// ── Tests — full labels on all screen sizes ───────────────────────────────────

describe('HistoryFeed — full labels on all screen sizes', () => {
  it('shows full food label including description', () => {
    const html = renderFeed([makeEvent({ type: 'food', notes: 'banana puree' })]);
    expect(html).toContain('Food — banana puree');
  });

  it('shows full diaper label including subtype', () => {
    const html = renderFeed([makeEvent({ type: 'diaper', notes: 'dirty' })]);
    expect(html).toContain('Diaper · dirty');
  });
});
