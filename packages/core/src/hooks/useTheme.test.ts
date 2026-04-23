import type { LatestEventMap, TrackerEvent } from '../types';
import { getSleepThemeAnchors, getSleepThemeOverride } from './useTheme';

function makeSleepEvent(
  babyId: string,
  startedAt: string,
  endedAt?: string,
): TrackerEvent {
  return {
    id: `${babyId}-${startedAt}`,
    babyId,
    type: 'sleep',
    startedAt,
    endedAt,
    createdAt: startedAt,
  };
}

describe('getSleepThemeAnchors', () => {
  it('returns zero anchors when there are no sleep events', () => {
    expect(getSleepThemeAnchors(['b1'], {})).toEqual({
      latestSleepStartMs: 0,
      latestSleepEndMs: 0,
    });
  });

  it('tracks the latest sleep start and latest sleep end across babies', () => {
    const latest: LatestEventMap = {
      'b1:sleep': makeSleepEvent('b1', '2026-03-14T19:00:00.000Z', '2026-03-15T05:45:00.000Z'),
      'b2:sleep': makeSleepEvent('b2', '2026-03-15T06:00:00.000Z'),
    };
    const anchors = getSleepThemeAnchors(['b1', 'b2'], latest);
    expect(anchors.latestSleepStartMs).toBe(new Date('2026-03-15T06:00:00.000Z').getTime());
    expect(anchors.latestSleepEndMs).toBe(new Date('2026-03-15T05:45:00.000Z').getTime());
  });
});

describe('getSleepThemeOverride', () => {
  const bedtimeHour = 19;

  it('returns day when a sleep end is more recent than the latest sleep start after bedtime', () => {
    const now = new Date('2026-03-15T05:40:00.000Z');
    const override = getSleepThemeOverride(
      new Date('2026-03-14T19:30:00.000Z').getTime(),
      new Date('2026-03-15T05:30:00.000Z').getTime(),
      now,
      bedtimeHour,
    );
    expect(override).toBe('day');
  });

  it('returns night when a sleep start is more recent than the latest sleep end after bedtime', () => {
    const now = new Date('2026-03-15T18:40:00.000Z');
    const override = getSleepThemeOverride(
      new Date('2026-03-15T18:30:00.000Z').getTime(),
      new Date('2026-03-15T05:30:00.000Z').getTime(),
      now,
      bedtimeHour,
    );
    expect(override).toBe('night');
  });

  it('returns null once the previous wake is before the most recent bedtime boundary', () => {
    const now = new Date(2026, 2, 15, 22, 0, 0);
    const override = getSleepThemeOverride(
      0,
      new Date(2026, 2, 15, 5, 30, 0).getTime(),
      now,
      bedtimeHour,
    );
    expect(override).toBeNull();
  });
});
