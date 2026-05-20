import type { Baby, LatestEventMap, TrackerEvent } from '../types';
import { buildLiveActivitySnapshots } from './liveActivitySnapshot';

const NOW = new Date('2026-04-20T14:00:00Z');

// Birth dates are anchored to the real clock so getAgeWeeks() (which uses Date.now())
// always returns a value in the expected stage range, regardless of when tests run.
const STAGE1_BIRTH_DATE = new Date(Date.now() - 10 * 7 * 24 * 60 * 60 * 1000).toISOString();
const STAGE2_BIRTH_DATE = new Date(Date.now() - 20 * 7 * 24 * 60 * 60 * 1000).toISOString();

const BABY: Baby = {
  id: 'b1',
  name: 'Emma',
  color: 'amber',
  birthDate: STAGE1_BIRTH_DATE,
  createdAt: STAGE1_BIRTH_DATE,
};

const BABY_TWO: Baby = {
  id: 'b2',
  name: 'Lucas',
  color: 'sky',
  birthDate: STAGE1_BIRTH_DATE,
  createdAt: STAGE1_BIRTH_DATE,
};

const STAGE_TWO_BABY: Baby = {
  id: 'b3',
  name: 'Milo',
  color: 'emerald',
  birthDate: STAGE2_BIRTH_DATE,
  createdAt: '2025-10-20T00:00:00Z',
};

function makeEvent(overrides: Partial<TrackerEvent>): TrackerEvent {
  return {
    id: 'e1',
    babyId: 'b1',
    type: 'bottle',
    value: 4,
    unit: 'oz',
    startedAt: '2026-04-20T12:00:00Z',
    createdAt: '2026-04-20T12:00:00Z',
    ...overrides,
  };
}

describe('buildLiveActivitySnapshots', () => {
  it('returns no activities when no baby has a relevant feed, pump, nap, or sleep event', () => {
    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      {},
      [],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toEqual([]);
  });

  it('builds a live activity snapshot for a bottle logged today', () => {
    const bottle = makeEvent({
      id: 'bottle-1',
      type: 'bottle',
      value: 5,
      unit: 'oz',
      startedAt: '2026-04-20T13:15:00Z',
      createdAt: '2026-04-20T13:15:00Z',
    });
    const latest: LatestEventMap = {
      'b1:bottle': bottle,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [bottle],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].activityId).toBe('twintracker:baby:b1');
    expect(snapshots[0].babies).toHaveLength(1);
    expect(snapshots[0].babies[0].eventType).toBe('bottle');
    expect(snapshots[0].babies[0].startedAt).toBe('2026-04-20T13:15:00Z');
  });

  it('builds a live activity snapshot for a pump logged today', () => {
    const pump = makeEvent({
      id: 'pump-1',
      type: 'pump',
      value: 4,
      unit: 'oz',
      startedAt: '2026-04-20T13:30:00Z',
      createdAt: '2026-04-20T13:30:00Z',
    });
    const latest: LatestEventMap = {
      'b1:pump': pump,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [pump],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].babies).toHaveLength(1);
    expect(snapshots[0].babies[0].eventType).toBe('pump');
  });

  it('builds a live activity snapshot for an active nap', () => {
    const nap = makeEvent({
      id: 'nap-1',
      type: 'nap',
      startedAt: '2026-04-20T13:00:00Z',
      createdAt: '2026-04-20T13:00:00Z',
    });
    const bottle = makeEvent({
      id: 'bottle-1',
      type: 'bottle',
      value: 5,
      unit: 'oz',
      startedAt: '2026-04-20T12:00:00Z',
      createdAt: '2026-04-20T12:00:00Z',
    });
    const latest: LatestEventMap = {
      'b1:nap': nap,
      'b1:bottle': bottle,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [bottle, nap],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].babies).toHaveLength(1);
    expect(snapshots[0].babies[0].eventType).toBe('nap');
    expect(snapshots[0].babies[0].startedAt).toBe('2026-04-20T13:00:00Z');
    expect(snapshots[0].babies[0].headline).toBeTruthy();
    expect(snapshots[0].babies[0].narrative).toBeTruthy();
    expect(snapshots[0].babies[0].feedSummary).toBeTruthy();
  });

  it('ignores stale feed and pump events from a prior day', () => {
    const yesterdayBottle = makeEvent({
      id: 'bottle-yesterday',
      type: 'bottle',
      value: 5,
      unit: 'oz',
      startedAt: '2026-04-19T23:00:00Z',
      createdAt: '2026-04-19T23:00:00Z',
    });
    const yesterdayPump = makeEvent({
      id: 'pump-yesterday',
      type: 'pump',
      value: 4,
      unit: 'oz',
      startedAt: '2026-04-19T22:00:00Z',
      createdAt: '2026-04-19T22:00:00Z',
    });
    const latest: LatestEventMap = {
      'b1:bottle': yesterdayBottle,
      'b1:pump': yesterdayPump,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [yesterdayBottle, yesterdayPump],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toEqual([]);
  });

  it('keeps an active overnight sleep live activity even if it started before today', () => {
    const overnightSleep = makeEvent({
      id: 'sleep-overnight',
      type: 'sleep',
      startedAt: '2026-04-19T23:30:00Z',
      createdAt: '2026-04-19T23:30:00Z',
    });
    const latest: LatestEventMap = {
      'b1:sleep': overnightSleep,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [overnightSleep],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].activityId).toBe('twintracker:baby:b1');
    expect(snapshots[0].babies[0].eventType).toBe('sleep');
    expect(snapshots[0].babies[0].startedAt).toBe('2026-04-19T23:30:00Z');
  });

  it('does not surface any next action while stage 2+ sleep is active', () => {
    const overnightSleep = makeEvent({
      id: 'sleep-overnight',
      babyId: 'b3',
      type: 'sleep',
      startedAt: '2026-04-19T23:30:00Z',
      createdAt: '2026-04-19T23:30:00Z',
    });
    const oldDiaper = makeEvent({
      id: 'diaper-old',
      babyId: 'b3',
      type: 'diaper',
      notes: 'wet',
      startedAt: '2026-04-19T00:00:00Z',
      createdAt: '2026-04-19T00:00:00Z',
    });
    const latest: LatestEventMap = {
      'b3:sleep': overnightSleep,
      'b3:diaper': oldDiaper,
    };

    const snapshots = buildLiveActivitySnapshots(
      [STAGE_TWO_BABY],
      latest,
      [oldDiaper, overnightSleep],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].babies[0].eventType).toBe('sleep');
    expect(snapshots[0].babies[0].nextActionType).toBeNull();
    expect(snapshots[0].babies[0].nextActionLabel).toBeNull();
    expect(snapshots[0].babies[0].nextSummary).toBeNull();
  });

  it('keeps next action visible for stage 1 newborn sleep', () => {
    const overnightSleep = makeEvent({
      id: 'sleep-newborn',
      type: 'sleep',
      startedAt: '2026-04-19T23:30:00Z',
      createdAt: '2026-04-19T23:30:00Z',
    });
    const oldDiaper = makeEvent({
      id: 'diaper-newborn',
      type: 'diaper',
      notes: 'wet',
      startedAt: '2026-04-19T00:00:00Z',
      createdAt: '2026-04-19T00:00:00Z',
    });
    const latest: LatestEventMap = {
      'b1:sleep': overnightSleep,
      'b1:diaper': oldDiaper,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY],
      latest,
      [oldDiaper, overnightSleep],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].babies[0].eventType).toBe('sleep');
    expect(snapshots[0].babies[0].nextActionType).not.toBeNull();
    expect(snapshots[0].babies[0].nextActionLabel).not.toBeNull();
  });

  it('still hides next action for stage 2+ babies when a newer feed event exists during sleep', () => {
    const overnightSleep = makeEvent({
      id: 'sleep-stage2',
      babyId: 'b3',
      type: 'sleep',
      startedAt: '2026-04-20T08:00:00Z',
      createdAt: '2026-04-20T08:00:00Z',
    });
    const recentBottle = makeEvent({
      id: 'bottle-stage2',
      babyId: 'b3',
      type: 'bottle',
      value: 6,
      unit: 'oz',
      startedAt: '2026-04-20T13:55:00Z',
      createdAt: '2026-04-20T13:55:00Z',
    });
    const latest: LatestEventMap = {
      'b3:sleep': overnightSleep,
      'b3:bottle': recentBottle,
    };

    const snapshots = buildLiveActivitySnapshots(
      [STAGE_TWO_BABY],
      latest,
      [overnightSleep, recentBottle],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].babies[0].narrative).toContain('sleeping for the night');
    expect(snapshots[0].babies[0].nextActionType).toBeNull();
    expect(snapshots[0].babies[0].nextActionLabel).toBeNull();
    expect(snapshots[0].babies[0].nextSummary).toBeNull();
  });

  it('builds one activity per active baby', () => {
    const emmaSleep = makeEvent({
      id: 'sleep-emma',
      type: 'sleep',
      startedAt: '2026-04-20T11:45:00Z',
      createdAt: '2026-04-20T11:45:00Z',
    });
    const lucasNap = makeEvent({
      id: 'nap-lucas',
      babyId: 'b2',
      type: 'nap',
      startedAt: '2026-04-20T12:15:00Z',
      createdAt: '2026-04-20T12:15:00Z',
    });
    const latest: LatestEventMap = {
      'b1:sleep': emmaSleep,
      'b2:nap': lucasNap,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY, BABY_TWO],
      latest,
      [emmaSleep, lucasNap],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map(snapshot => snapshot.activityId)).toEqual([
      'twintracker:baby:b1',
      'twintracker:baby:b2',
    ]);
    expect(snapshots.map(snapshot => snapshot.babies[0].babyName)).toEqual(['Emma', 'Lucas']);
  });

  it('preserves baby color differentiation across per-baby activities', () => {
    const emmaSleep = makeEvent({
      id: 'sleep-emma',
      type: 'sleep',
      startedAt: '2026-04-20T11:45:00Z',
      createdAt: '2026-04-20T11:45:00Z',
    });
    const lucasBottle = makeEvent({
      id: 'bottle-lucas',
      babyId: 'b2',
      type: 'bottle',
      value: 6,
      unit: 'oz',
      startedAt: '2026-04-20T12:15:00Z',
      createdAt: '2026-04-20T12:15:00Z',
    });
    const latest: LatestEventMap = {
      'b1:sleep': emmaSleep,
      'b2:bottle': lucasBottle,
    };

    const snapshots = buildLiveActivitySnapshots(
      [BABY, BABY_TWO],
      latest,
      [emmaSleep, lucasBottle],
      { wakeHour: 7, bedtimeHour: 19 },
      NOW,
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map(snapshot => snapshot.babies[0].babyColor)).toEqual(['amber', 'sky']);
  });
});
