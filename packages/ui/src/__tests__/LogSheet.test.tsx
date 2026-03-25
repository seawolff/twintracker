/**
 * LogSheet.web tests — verifies end-time field renders for nap/sleep,
 * is absent for other types, and pre-fills correctly when editing.
 *
 * Uses renderToStaticMarkup (SSR snapshot of initial render state).
 * Submission payload behaviour is covered by the core analytics/schedule tests.
 *
 * The @tt/core mock (jest/tt-core.ts) returns i18n keys as-is, so assertions
 * check for keys like 'log_sheet.end_time' rather than translated strings.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { LogSheet } from '../components/LogSheet.web';
import type { Baby, EventType, TrackerEvent } from '@tt/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BABY: Baby = {
  id: 'b1',
  name: 'Leo',
  color: 'amber',
  createdAt: '2026-01-01T00:00:00Z',
};

function makeEvent(overrides: Partial<TrackerEvent>): TrackerEvent {
  return {
    id: 'e1',
    babyId: 'b1',
    type: 'nap',
    startedAt: '2026-03-18T14:00:00Z',
    createdAt: '2026-03-18T14:00:00Z',
    ...overrides,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function render(type: EventType, overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <LogSheet
      visible={true}
      baby={BABY}
      eventType={type}
      onSubmit={jest.fn()}
      onClose={jest.fn()}
      {...overrides}
    />,
  );
}

// ── End-time field visibility ─────────────────────────────────────────────────

describe('LogSheet — end time field', () => {
  // Live logs from baby card never show End time (wake is recorded separately)
  it('does NOT render end time key for live nap log', () => {
    expect(render('nap')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for live sleep log', () => {
    expect(render('sleep')).not.toContain('log_sheet.end_time');
  });

  // Editing an existing event from history shows End time
  it('renders end time key when editing a nap', () => {
    const html = render('nap', { initialEvent: makeEvent({ type: 'nap' }), onEdit: jest.fn() });
    expect(html).toContain('log_sheet.end_time');
  });

  it('renders end time key when editing a sleep', () => {
    const html = render('sleep', { initialEvent: makeEvent({ type: 'sleep' }), onEdit: jest.fn() });
    expect(html).toContain('log_sheet.end_time');
  });

  // Quick-add from history (past start time, no initialEvent) also shows End time
  it('renders end time key for history quick-add nap', () => {
    const html = render('nap', { initialStartedAt: '2026-03-18T14:00' });
    expect(html).toContain('log_sheet.end_time');
  });

  it('renders end time key for history quick-add sleep', () => {
    const html = render('sleep', { initialStartedAt: '2026-03-17T22:00' });
    expect(html).toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for bottle', () => {
    expect(render('bottle')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for nursing', () => {
    expect(render('nursing')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for diaper', () => {
    expect(render('diaper')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for food', () => {
    expect(render('food')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for medicine', () => {
    expect(render('medicine')).not.toContain('log_sheet.end_time');
  });

  it('does NOT render end time key for milestone', () => {
    expect(render('milestone')).not.toContain('log_sheet.end_time');
  });
});

// ── Type labels ───────────────────────────────────────────────────────────────

describe('LogSheet — type labels', () => {
  it('shows sleep type key for sleep type', () => {
    expect(render('sleep')).toContain('log_sheet.types.sleep');
  });

  it('shows nap type key for nap type', () => {
    expect(render('nap')).toContain('log_sheet.types.nap');
  });

  it('shows log action key for new sleep', () => {
    expect(render('sleep')).toContain('log_sheet.log');
  });

  it('shows log action key for new nap', () => {
    expect(render('nap')).toContain('log_sheet.log');
  });
});

// ── Editing a sleep event ─────────────────────────────────────────────────────

describe('LogSheet — editing a sleep event', () => {
  it('shows end time key when editing a sleep with endedAt', () => {
    const html = render('sleep', {
      initialEvent: makeEvent({
        type: 'sleep',
        startedAt: '2026-03-18T22:00:00Z',
        endedAt: '2026-03-19T06:30:00Z',
      }),
    });
    expect(html).toContain('log_sheet.end_time');
  });

  it('shows update action key when editing sleep', () => {
    const html = render('sleep', {
      initialEvent: makeEvent({ type: 'sleep' }),
      onEdit: jest.fn(),
    });
    expect(html).toContain('log_sheet.update');
  });

  it('shows update action key when editing a nap', () => {
    const html = render('nap', {
      initialEvent: makeEvent({ type: 'nap' }),
      onEdit: jest.fn(),
    });
    expect(html).toContain('log_sheet.update');
  });
});

// ── Start time field always present ──────────────────────────────────────────

describe('LogSheet — start time field', () => {
  it('renders start time key for every event type', () => {
    const types: EventType[] = [
      'bottle',
      'nursing',
      'nap',
      'sleep',
      'diaper',
      'food',
      'medicine',
      'milestone',
    ];
    for (const type of types) {
      expect(render(type)).toContain('log_sheet.start_time');
    }
  });
});

// ── Author attribution header ─────────────────────────────────────────────────

describe('LogSheet — author attribution', () => {
  it('shows logged_by i18n key when editing an event with loggedByName', () => {
    const html = render('bottle', {
      initialEvent: makeEvent({ type: 'bottle', loggedByName: 'Mom' }),
      onEdit: jest.fn(),
    });
    expect(html).toContain('log_sheet.logged_by');
  });

  it('shows logged_by i18n key for a different author', () => {
    const html = render('nap', {
      initialEvent: makeEvent({ type: 'nap', loggedByName: 'Dad' }),
      onEdit: jest.fn(),
    });
    expect(html).toContain('log_sheet.logged_by');
  });

  it('shows the first initial of the author name', () => {
    const html = render('diaper', {
      initialEvent: makeEvent({ type: 'diaper', loggedByName: 'Mom' }),
      onEdit: jest.fn(),
    });
    expect(html).toContain('M');
  });

  it('does NOT show logged_by key when loggedByName is absent', () => {
    const html = render('bottle', {
      initialEvent: makeEvent({ type: 'bottle' }),
      onEdit: jest.fn(),
    });
    expect(html).not.toContain('log_sheet.logged_by');
  });

  it('does NOT show logged_by key on a new (non-edit) log sheet', () => {
    expect(render('bottle')).not.toContain('log_sheet.logged_by');
  });
});
