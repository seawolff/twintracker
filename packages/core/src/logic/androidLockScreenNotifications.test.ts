import type { LiveActivitySnapshot } from './liveActivitySnapshot';
import { buildAndroidLockScreenNotificationPayload } from './androidLockScreenNotifications';

const baseSnapshot = {
  babyId: 'baby-1',
  babyName: 'George',
  babyColor: 'amber' as const,
  eventId: 'event-1',
  eventType: 'sleep' as const,
  startedAt: '2026-04-22T06:00:00.000Z',
  headline: 'George is sleeping',
  narrative: 'George is sleeping for the night.',
  urgency: 'ok' as const,
  lastEventLabel: 'Sleep',
  lastEventAt: '2026-04-22T06:00:00.000Z',
  nextActionType: null,
  nextActionLabel: null,
  nextTargetAt: null,
  nextSummary: null,
  feedSummary: '1/6 · 8oz',
  feedUrgency: 'ok' as const,
  feedMode: 'bottle' as const,
  sleepSummary: '5h 18m',
  sleepUrgency: 'ok' as const,
  diaperSummary: '14h ago',
  diaperUrgency: 'soon' as const,
};

function makeSnapshots(): LiveActivitySnapshot[] {
  return [
    {
      activityId: 'twintracker:baby:baby-1',
      babies: [baseSnapshot],
    },
    {
      activityId: 'twintracker:baby:baby-2',
      babies: [
        {
          ...baseSnapshot,
          babyId: 'baby-2',
          babyName: 'Alfred',
          babyColor: 'sky',
          eventType: 'bottle',
          startedAt: '2026-04-22T07:30:00.000Z',
          headline: 'Bottle due soon',
          narrative: 'Alfred should eat within about 30 minutes.',
          nextActionType: 'bottle',
          nextActionLabel: 'Bottle',
          nextTargetAt: '2026-04-22T08:00:00.000Z',
          nextSummary: 'Bottle due soon',
        },
      ],
    },
  ];
}

describe('buildAndroidLockScreenNotificationPayload', () => {
  it('returns null when no live activity snapshots are active', () => {
    expect(buildAndroidLockScreenNotificationPayload([])).toBeNull();
  });

  it('builds one child notification per baby and a household summary payload', () => {
    const payload = buildAndroidLockScreenNotificationPayload(
      makeSnapshots(),
      new Date('2026-04-22T07:30:00.000Z'),
    );
    expect(payload).not.toBeNull();
    expect(payload?.summaryTitle).toBe('TwinTracker');
    expect(payload?.summaryText).toBe('2 children active');
    expect(payload?.summaryLines).toEqual(['Alfred · Bottle due · 30m', 'George · Sleeping · 5h 18m']);
    expect(payload?.children).toHaveLength(2);
  });

  it('orders child notifications by most recent snapshot first', () => {
    const payload = buildAndroidLockScreenNotificationPayload(
      makeSnapshots(),
      new Date('2026-04-22T07:30:00.000Z'),
    );
    expect(payload?.children.map(child => child.title)).toEqual([
      'Alfred · Bottle due · 30m',
      'George · Sleeping · 5h 18m',
    ]);
  });

  it('uses the same next-action info as the live activity snapshot when present', () => {
    const payload = buildAndroidLockScreenNotificationPayload(
      makeSnapshots(),
      new Date('2026-04-22T07:30:00.000Z'),
    );
    expect(payload?.children[0].expandedBody).toContain('Bottle: Bottle due soon');
    expect(payload?.children[1].expandedBody).not.toContain('Bottle:');
    expect(payload?.children[0].body).toBe('Bottle due soon');
    expect(payload?.children[1].body).toBe('Sleeping for the night');
  });

  it('keeps active naps focused on wake timing instead of bottle or diaper prompts', () => {
    const snapshots = makeSnapshots();
    snapshots[0].babies[0] = {
      ...snapshots[0].babies[0],
      eventType: 'nap',
      narrative: 'Likely awake around 8:05 AM, in about 18 minutes.',
      nextActionType: 'bottle',
      nextActionLabel: 'Bottle',
      nextTargetAt: '2026-04-22T08:00:00.000Z',
      nextSummary: 'Bottle due soon',
    };

    const payload = buildAndroidLockScreenNotificationPayload(
      snapshots,
      new Date('2026-04-22T07:47:00.000Z'),
    );

    expect(payload?.children[1].title).toBe('George · Sleeping · 5h 18m');
    expect(payload?.children[1].body).toBe('Likely awake around 8:05 AM, in about 18 minutes.');
  });

  it('keeps overnight sleep rows focused on sleep even when a newborn next action exists', () => {
    const snapshots = makeSnapshots();
    snapshots[0].babies[0] = {
      ...snapshots[0].babies[0],
      nextActionType: 'bottle',
      nextActionLabel: 'Bottle',
      nextTargetAt: '2026-04-22T07:40:00.000Z',
      nextSummary: 'Bottle due soon',
    };

    const payload = buildAndroidLockScreenNotificationPayload(
      snapshots,
      new Date('2026-04-22T07:30:00.000Z'),
    );

    expect(payload?.children[1].title).toBe('George · Sleeping · 5h 18m');
    expect(payload?.children[1].body).toBe('Sleeping for the night');
  });

  it('shortens long sleep narratives for the collapsed child row', () => {
    const snapshots = makeSnapshots();
    snapshots[0].babies[0] = {
      ...snapshots[0].babies[0],
      narrative: 'Sleeping a bit longer than usual. Could be awake soon.',
    };

    const payload = buildAndroidLockScreenNotificationPayload(
      snapshots,
      new Date('2026-04-22T07:30:00.000Z'),
    );

    expect(payload?.children[1].body).toBe('Sleep running long');
  });

  it('prioritizes bedtime or nap timing over feed and diaper in the child title', () => {
    const snapshots = makeSnapshots();
    snapshots[0].babies[0] = {
      ...snapshots[0].babies[0],
      eventType: 'bottle',
      headline: 'George is awake',
      narrative: 'Bedtime in about 8 minutes.',
      nextActionType: 'sleep',
      nextActionLabel: 'Bedtime',
      nextTargetAt: '2026-04-22T07:38:00.000Z',
      nextSummary: 'Bedtime in 8m',
    };

    const payload = buildAndroidLockScreenNotificationPayload(
      snapshots,
      new Date('2026-04-22T07:30:00.000Z'),
    );

    expect(payload?.children[1].title).toBe('George · Bedtime due · 8m');
    expect(payload?.children[1].body).toBe('Bedtime in 8m');
  });
});
