import { groupEventsByDay, currentPeriodStart } from './grouping';
import type { TrackerEvent } from '../types';

function makeEvent(id: string, startedAt: string, babyId = 'b1'): TrackerEvent {
  return { id, babyId, type: 'bottle', startedAt, oz: 4, createdAt: startedAt } as TrackerEvent;
}

describe('currentPeriodStart', () => {
  it('returns today at resetHour when now is after resetHour', () => {
    const now = new Date(2026, 2, 14, 10, 0, 0); // 10:00 AM March 14
    const result = currentPeriodStart(now, 6);
    expect(result).toEqual(new Date(2026, 2, 14, 6, 0, 0));
  });

  it('returns yesterday at resetHour when now is before resetHour', () => {
    const now = new Date(2026, 2, 14, 4, 0, 0); // 4:00 AM March 14
    const result = currentPeriodStart(now, 6);
    expect(result).toEqual(new Date(2026, 2, 13, 6, 0, 0));
  });

  it('returns today at resetHour when now is exactly at resetHour', () => {
    const now = new Date(2026, 2, 14, 6, 0, 0); // exactly 6:00 AM
    const result = currentPeriodStart(now, 6);
    expect(result).toEqual(new Date(2026, 2, 14, 6, 0, 0));
  });

  it('handles midnight reset (resetHour=0)', () => {
    const now = new Date(2026, 2, 14, 23, 59, 0);
    const result = currentPeriodStart(now, 0);
    expect(result).toEqual(new Date(2026, 2, 14, 0, 0, 0));
  });
});

describe('groupEventsByDay', () => {
  const NOW = new Date(2026, 2, 14, 15, 0, 0); // 3:00 PM, March 14 2026

  it('returns [] for empty events', () => {
    expect(groupEventsByDay([], NOW)).toEqual([]);
  });

  it('groups all today events into a single "Today" group', () => {
    const events = [makeEvent('1', '2026-03-14T10:00:00'), makeEvent('2', '2026-03-14T12:00:00')];
    const groups = groupEventsByDay(events, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].events).toHaveLength(2);
  });

  it('sorts events within a group descending by startedAt', () => {
    const events = [
      makeEvent('1', '2026-03-14T08:00:00'),
      makeEvent('2', '2026-03-14T12:00:00'),
      makeEvent('3', '2026-03-14T10:00:00'),
    ];
    const groups = groupEventsByDay(events, NOW);
    expect(groups[0].events[0].id).toBe('2');
    expect(groups[0].events[1].id).toBe('3');
    expect(groups[0].events[2].id).toBe('1');
  });

  it('splits events across two days into "Today" and "Yesterday"', () => {
    const events = [makeEvent('1', '2026-03-14T10:00:00'), makeEvent('2', '2026-03-13T10:00:00')];
    const groups = groupEventsByDay(events, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
  });

  it('returns groups in descending order (most recent first)', () => {
    const events = [
      makeEvent('1', '2026-03-14T10:00:00'),
      makeEvent('2', '2026-03-12T10:00:00'),
      makeEvent('3', '2026-03-13T10:00:00'),
    ];
    const groups = groupEventsByDay(events, NOW);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[2].label).toBe('March 12th 2026');
  });

  it('formats older dates as "Month Nth YYYY"', () => {
    const events = [makeEvent('1', '2026-03-01T10:00:00'), makeEvent('2', '2026-03-02T10:00:00')];
    const groups = groupEventsByDay(events, NOW);
    const labels = groups.map(g => g.label);
    expect(labels).toContain('March 2nd 2026');
    expect(labels).toContain('March 1st 2026');
  });

  it('event exactly at reset boundary belongs to the new period', () => {
    // resetHour = 6, event at exactly 6:00 AM today → "Today"
    const events = [makeEvent('1', '2026-03-14T06:00:00')];
    const groups = groupEventsByDay(events, NOW, 6);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
  });

  it('event one ms before reset boundary belongs to previous period', () => {
    // resetHour = 6, event at 5:59:59.999 AM today → "Yesterday"
    const events = [makeEvent('1', '2026-03-14T05:59:59.999')];
    const groups = groupEventsByDay(events, NOW, 6);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Yesterday');
  });

  it('non-zero resetHour shifts grouping: 5 AM event belongs to yesterday when resetHour=6', () => {
    const events = [
      makeEvent('1', '2026-03-14T05:00:00'), // before 6 AM reset → yesterday's period
      makeEvent('2', '2026-03-14T07:00:00'), // after 6 AM reset → today's period
    ];
    const groups = groupEventsByDay(events, NOW, 6);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].events[0].id).toBe('2');
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].events[0].id).toBe('1');
  });

  it('handles events from many days ago correctly', () => {
    const events = [
      makeEvent('1', '2026-03-14T10:00:00'), // today
      makeEvent('2', '2026-03-10T10:00:00'), // 4 days ago
    ];
    const groups = groupEventsByDay(events, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('March 10th 2026');
  });

  // ── Sleep attribution by endedAt ─────────────────────────────────────────────

  it('sleep event started Sunday night is bucketed into Monday when it ends Monday morning', () => {
    // NOW = 3pm Monday March 14. resetHour = 0 (midnight).
    // Sleep started 9pm Sunday (March 13), ended 6am Monday (March 14) → belongs to Today.
    const sleepEvent: TrackerEvent = {
      id: 's1',
      babyId: 'b1',
      type: 'sleep',
      startedAt: '2026-03-13T21:00:00',
      endedAt: '2026-03-14T06:00:00',
      createdAt: '2026-03-13T21:00:00',
    } as TrackerEvent;
    const groups = groupEventsByDay([sleepEvent], NOW, 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
  });

  it('nap event started before midnight is bucketed by endedAt when it crosses midnight', () => {
    // Nap starts 11:50pm March 13, ends 12:10am March 14 → belongs to Today (March 14).
    const napEvent: TrackerEvent = {
      id: 'n1',
      babyId: 'b1',
      type: 'nap',
      startedAt: '2026-03-13T23:50:00',
      endedAt: '2026-03-14T00:10:00',
      createdAt: '2026-03-13T23:50:00',
    } as TrackerEvent;
    const groups = groupEventsByDay([napEvent], NOW, 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
  });

  it('sleep without endedAt is bucketed by startedAt (still active)', () => {
    const sleepEvent: TrackerEvent = {
      id: 's2',
      babyId: 'b1',
      type: 'sleep',
      startedAt: '2026-03-13T21:00:00',
      createdAt: '2026-03-13T21:00:00',
    } as TrackerEvent;
    const groups = groupEventsByDay([sleepEvent], NOW, 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Yesterday');
  });

  it('sleep ending in the morning sorts near top of that day group', () => {
    // Sleep ends 6am March 14 (Today). Bottle at 7am today.
    // Sleep (endedAt 6am) should appear after the 7am bottle in descending sort.
    const sleepEvent: TrackerEvent = {
      id: 's1',
      babyId: 'b1',
      type: 'sleep',
      startedAt: '2026-03-13T21:00:00',
      endedAt: '2026-03-14T06:00:00',
      createdAt: '2026-03-13T21:00:00',
    } as TrackerEvent;
    const bottle = makeEvent('bt1', '2026-03-14T07:00:00');
    const groups = groupEventsByDay([sleepEvent, bottle], NOW, 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].events[0].id).toBe('bt1'); // bottle at 7am first (descending by endedAt/startedAt)
    expect(groups[0].events[1].id).toBe('s1'); // sleep ended at 6am second
  });

  it('ordinal labels: 1st, 2nd, 3rd, 4th, 11th, 21st', () => {
    const base = new Date(2026, 0, 1, 15, 0, 0); // Jan 1
    const cases: Array<[string, string]> = [
      ['2026-01-01T10:00:00', 'Today'],
      ['2025-12-31T10:00:00', 'Yesterday'],
      ['2025-12-11T10:00:00', 'December 11th 2025'],
      ['2025-12-21T10:00:00', 'December 21st 2025'],
      ['2025-12-22T10:00:00', 'December 22nd 2025'],
      ['2025-12-23T10:00:00', 'December 23rd 2025'],
      ['2025-12-03T10:00:00', 'December 3rd 2025'],
      ['2025-12-02T10:00:00', 'December 2nd 2025'],
    ];
    const events = cases.map(([ts], i) => makeEvent(String(i), ts));
    const groups = groupEventsByDay(events, base);
    const labelMap = Object.fromEntries(groups.map(g => [g.events[0].id, g.label]));
    cases.forEach(([, expectedLabel], i) => {
      expect(labelMap[String(i)]).toBe(expectedLabel);
    });
  });
});
