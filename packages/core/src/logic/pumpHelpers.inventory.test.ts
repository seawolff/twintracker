import { getPumpStashTotalOz, summarizeStashInventory } from './pumpHelpers';

describe('pump stash inventory helpers', () => {
  it('returns 0 for non-pump events and pump events without stash metadata', () => {
    expect(getPumpStashTotalOz({ type: 'bottle', notes: undefined })).toBe(0);
    expect(getPumpStashTotalOz({ type: 'pump', notes: 'both' })).toBe(0);
  });

  it('calculates total stash oz from structured pump notes', () => {
    expect(getPumpStashTotalOz({ type: 'pump', notes: 'side=both;stashCount=3;stashOz=4' })).toBe(
      12,
    );
  });

  it('summarizes current stash inventory across pump sessions', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
            startedAt: '2026-04-10T12:00:00Z',
          },
          {
            type: 'pump',
            notes: 'side=left;stashCount=1;stashOz=5;stashLocation=freezer',
            startedAt: '2026-04-11T12:00:00Z',
          },
          { type: 'pump', notes: 'right', startedAt: '2026-04-12T12:00:00Z' },
          { type: 'bottle', notes: undefined, startedAt: '2026-04-12T14:00:00Z' },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 13,
      totalBottles: 3,
      totalSessions: 2,
      fridgeOz: 8,
      freezerOz: 5,
      fridgeBottles: 2,
      freezerBottles: 1,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: 2,
      oldestLocation: 'fridge',
      unmatchedUsageOz: 0,
    });
  });

  it('subtracts stash-fed bottles from the current balance using FIFO by location', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
            startedAt: '2026-04-10T12:00:00Z',
          },
          {
            type: 'pump',
            notes: 'side=left;stashCount=1;stashOz=5;stashLocation=freezer',
            startedAt: '2026-04-11T12:00:00Z',
          },
          {
            type: 'bottle',
            value: 4,
            notes: 'source=fridge',
            startedAt: '2026-04-12T08:00:00Z',
          },
          {
            type: 'bottle',
            value: 3,
            notes: 'source=freezer',
            startedAt: '2026-04-12T09:00:00Z',
          },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 6,
      totalBottles: 2,
      totalSessions: 2,
      fridgeOz: 4,
      freezerOz: 2,
      fridgeBottles: 1,
      freezerBottles: 1,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: 2,
      oldestLocation: 'fridge',
      unmatchedUsageOz: 0,
    });
  });

  it('tracks unmatched stash usage when bottle logs exceed remaining stash', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=1;stashOz=4;stashLocation=fridge',
            startedAt: '2026-04-10T12:00:00Z',
          },
          {
            type: 'bottle',
            value: 6,
            notes: 'source=fridge',
            startedAt: '2026-04-11T08:00:00Z',
          },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 0,
      totalBottles: 0,
      totalSessions: 0,
      fridgeOz: 0,
      freezerOz: 0,
      fridgeBottles: 0,
      freezerBottles: 0,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: null,
      oldestLocation: null,
      unmatchedUsageOz: 2,
    });
  });

  it('restores stash balance when a stash-fed bottle is edited to a non-stash source', () => {
    const stashPump = {
      type: 'pump' as const,
      notes: 'side=both;stashCount=2;stashOz=4;stashLocation=freezer',
      startedAt: '2026-04-10T12:00:00Z',
    };
    const stashBottle = {
      type: 'bottle' as const,
      value: 4,
      notes: 'source=freezer',
      startedAt: '2026-04-11T08:00:00Z',
    };

    expect(
      summarizeStashInventory([stashPump, stashBottle], new Date('2026-04-12T18:00:00Z')),
    ).toMatchObject({
      totalOz: 4,
      totalBottles: 1,
      freezerOz: 4,
      unmatchedUsageOz: 0,
    });

    expect(
      summarizeStashInventory(
        [{ ...stashPump }, { ...stashBottle, notes: 'source=formula' }],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toMatchObject({
      totalOz: 8,
      totalBottles: 2,
      freezerOz: 8,
      unmatchedUsageOz: 0,
    });
  });

  it('updates stash balance and unmatched usage when a stash-fed bottle amount is edited', () => {
    const events = [
      {
        type: 'pump' as const,
        notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
        startedAt: '2026-04-10T12:00:00Z',
      },
      {
        type: 'bottle' as const,
        value: 4,
        notes: 'source=fridge',
        startedAt: '2026-04-11T08:00:00Z',
      },
    ];

    expect(summarizeStashInventory(events, new Date('2026-04-12T18:00:00Z'))).toMatchObject({
      totalOz: 4,
      totalBottles: 1,
      unmatchedUsageOz: 0,
    });

    expect(
      summarizeStashInventory(
        [{ ...events[0] }, { ...events[1], value: 10 }],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toMatchObject({
      totalOz: 0,
      totalBottles: 0,
      unmatchedUsageOz: 2,
    });
  });

  it('lets unknown-location stash cover stash-fed bottles from either fridge or freezer', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=2;stashOz=4',
            startedAt: '2026-04-10T12:00:00Z',
          },
          {
            type: 'bottle',
            value: 4,
            notes: 'source=freezer',
            startedAt: '2026-04-11T08:00:00Z',
          },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 4,
      totalBottles: 1,
      totalSessions: 1,
      fridgeOz: 0,
      freezerOz: 0,
      fridgeBottles: 0,
      freezerBottles: 0,
      unknownOz: 4,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: 2,
      oldestLocation: 'unknown',
      unmatchedUsageOz: 0,
    });
  });

  it('falls back to the other stash location so total balance still drops when bottle location was tagged differently', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
            startedAt: '2026-04-10T12:00:00Z',
          },
          {
            type: 'bottle',
            value: 4,
            notes: 'source=freezer',
            startedAt: '2026-04-11T08:00:00Z',
          },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 4,
      totalBottles: 1,
      totalSessions: 1,
      fridgeOz: 4,
      freezerOz: 0,
      fridgeBottles: 1,
      freezerBottles: 0,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 0,
      oldestAgeDays: 2,
      oldestLocation: 'fridge',
      unmatchedUsageOz: 0,
    });
  });

  it('flags fridge stash nearing best-by and freezer stash past best-by', () => {
    expect(
      summarizeStashInventory(
        [
          {
            type: 'pump',
            notes: 'side=both;stashCount=1;stashOz=4;stashLocation=fridge',
            startedAt: '2026-04-08T12:00:00Z',
          },
          {
            type: 'pump',
            notes: 'side=left;stashCount=1;stashOz=5;stashLocation=freezer',
            startedAt: '2025-10-13T12:00:00Z',
          },
        ],
        new Date('2026-04-12T18:00:00Z'),
      ),
    ).toEqual({
      totalOz: 9,
      totalBottles: 2,
      totalSessions: 2,
      fridgeOz: 4,
      freezerOz: 5,
      fridgeBottles: 1,
      freezerBottles: 1,
      unknownOz: 0,
      expiringSoonBottles: 0,
      expiredBottles: 2,
      oldestAgeDays: 181,
      oldestLocation: 'freezer',
      unmatchedUsageOz: 0,
    });
  });
});
