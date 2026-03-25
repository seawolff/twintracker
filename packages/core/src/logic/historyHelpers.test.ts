import { formatTime, formatDuration, formatTimeAgo, eventLabel } from './historyHelpers';
import type { TrackerEvent } from '../types';

// ── formatTime ────────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats an ISO timestamp as HH:MM', () => {
    // Use a fixed UTC offset-aware string; toLocaleTimeString output varies by locale
    const iso = '2026-03-14T10:30:00.000Z';
    const result = formatTime(iso);
    // Just verify it looks like a time string (locale-dependent)
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats sub-hour duration as "Xm"', () => {
    const start = '2026-03-14T09:00:00.000Z';
    const end = '2026-03-14T09:45:00.000Z';
    expect(formatDuration(start, end)).toBe('45m');
  });

  it('formats exactly 1 hour as "1h 0m"', () => {
    const start = '2026-03-14T08:00:00.000Z';
    const end = '2026-03-14T09:00:00.000Z';
    expect(formatDuration(start, end)).toBe('1h 0m');
  });

  it('formats multi-hour duration as "Xh Ym"', () => {
    const start = '2026-03-14T07:00:00.000Z';
    const end = '2026-03-14T09:05:00.000Z';
    expect(formatDuration(start, end)).toBe('2h 5m');
  });

  it('formats zero duration as "0m"', () => {
    const iso = '2026-03-14T09:00:00.000Z';
    expect(formatDuration(iso, iso)).toBe('0m');
  });
});

// ── formatTimeAgo ─────────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {
  const now = new Date('2026-03-14T10:00:00.000Z');

  it('returns "just now" when under 60 seconds ago', () => {
    const iso = new Date(now.getTime() - 30_000).toISOString();
    expect(formatTimeAgo(iso, now)).toBe('just now');
  });

  it('returns "Xm ago" when under 1 hour', () => {
    const iso = new Date(now.getTime() - 45 * 60_000).toISOString();
    expect(formatTimeAgo(iso, now)).toBe('45m ago');
  });

  it('returns "Xh Ym ago" when 1+ hours', () => {
    const iso = new Date(now.getTime() - (2 * 60 + 15) * 60_000).toISOString();
    expect(formatTimeAgo(iso, now)).toBe('2h 15m ago');
  });

  it('returns "1h 0m ago" for exactly 1 hour', () => {
    const iso = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect(formatTimeAgo(iso, now)).toBe('1h 0m ago');
  });
});

// ── eventLabel ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TrackerEvent>): TrackerEvent {
  return {
    id: 'e1',
    babyId: 'b1',
    type: 'bottle',
    startedAt: '2026-03-14T09:00:00.000Z',
    createdAt: '2026-03-14T09:00:00.000Z',
    ...overrides,
  } as TrackerEvent;
}

describe('eventLabel', () => {
  it('bottle with value and default unit', () => {
    expect(eventLabel(makeEvent({ type: 'bottle', value: 4 }))).toBe('Bottle 4oz');
  });

  it('bottle with explicit unit', () => {
    expect(eventLabel(makeEvent({ type: 'bottle', value: 120, unit: 'ml' }))).toBe('Bottle 120ml');
  });

  it('bottle without value', () => {
    expect(eventLabel(makeEvent({ type: 'bottle', value: undefined }))).toBe('Bottle');
  });

  it('nursing', () => {
    expect(eventLabel(makeEvent({ type: 'nursing' }))).toBe('Nursing');
  });

  it('nap without endedAt', () => {
    expect(eventLabel(makeEvent({ type: 'nap' }))).toBe('Nap');
  });

  it('nap with endedAt shows duration', () => {
    expect(
      eventLabel(
        makeEvent({
          type: 'nap',
          startedAt: '2026-03-14T09:00:00.000Z',
          endedAt: '2026-03-14T10:05:00.000Z',
        }),
      ),
    ).toBe('Nap 1h 5m');
  });

  it('sleep without endedAt', () => {
    expect(eventLabel(makeEvent({ type: 'sleep' }))).toBe('Sleep');
  });

  it('sleep with endedAt shows duration', () => {
    expect(
      eventLabel(
        makeEvent({
          type: 'sleep',
          startedAt: '2026-03-14T00:00:00.000Z',
          endedAt: '2026-03-14T08:30:00.000Z',
        }),
      ),
    ).toBe('Sleep 8h 30m');
  });

  it('diaper with notes', () => {
    expect(eventLabel(makeEvent({ type: 'diaper', notes: 'dirty' }))).toBe('Diaper · dirty');
  });

  it('diaper without notes defaults to "wet"', () => {
    expect(eventLabel(makeEvent({ type: 'diaper', notes: undefined }))).toBe('Diaper · wet');
  });

  it('medicine', () => {
    expect(eventLabel(makeEvent({ type: 'medicine' }))).toBe('Medicine');
  });

  it('food with notes', () => {
    expect(eventLabel(makeEvent({ type: 'food', notes: 'banana puree' }))).toBe(
      'Food — banana puree',
    );
  });

  it('food without notes', () => {
    expect(eventLabel(makeEvent({ type: 'food', notes: undefined }))).toBe('Food');
  });

  it('milestone with notes', () => {
    expect(eventLabel(makeEvent({ type: 'milestone', notes: 'First steps' }))).toBe(
      '★ First steps',
    );
  });

  it('milestone without notes', () => {
    expect(eventLabel(makeEvent({ type: 'milestone', notes: undefined }))).toBe('★ Milestone');
  });

  it('unknown type falls through to type string', () => {
    expect(eventLabel(makeEvent({ type: 'unknown' as TrackerEvent['type'] }))).toBe('unknown');
  });
});
