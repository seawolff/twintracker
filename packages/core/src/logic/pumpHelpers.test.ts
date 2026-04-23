import {
  formatBottleSource,
  formatPumpStash,
  getEventStashOz,
  parseBottleNotes,
  parsePumpNotes,
  serializeBottleNotes,
  serializePumpNotes,
} from './pumpHelpers';

describe('pumpHelpers', () => {
  test('parses legacy plain-side notes', () => {
    expect(parsePumpNotes('left')).toEqual({
      side: 'left',
      stashCount: 0,
      stashOzPerBottle: null,
      stashLocation: null,
    });
  });

  test('parses structured stash metadata', () => {
    expect(parsePumpNotes('side=both;stashCount=2;stashOz=4;stashLocation=freezer')).toEqual({
      side: 'both',
      stashCount: 2,
      stashOzPerBottle: 4,
      stashLocation: 'freezer',
    });
  });

  test('serializes stash metadata only when stash is present', () => {
    expect(
      serializePumpNotes({
        side: 'both',
        stashCount: 2,
        stashOzPerBottle: 4,
        stashLocation: 'fridge',
      }),
    ).toBe('side=both;stashCount=2;stashOz=4;stashLocation=fridge');

    expect(
      serializePumpNotes({
        side: 'right',
        stashCount: 0,
        stashOzPerBottle: null,
        stashLocation: null,
      }),
    ).toBe('right');
  });

  test('defaults stash location to fridge when stash exists but no location is set', () => {
    expect(
      serializePumpNotes({
        side: 'both',
        stashCount: 2,
        stashOzPerBottle: 4,
        stashLocation: null,
      }),
    ).toBe('side=both;stashCount=2;stashOz=4;stashLocation=fridge');
  });

  test('formats stash summary for history labels', () => {
    expect(
      formatPumpStash({
        side: 'both',
        stashCount: 2,
        stashOzPerBottle: 4,
        stashLocation: 'fridge',
      }),
    ).toBe('stash 2x4oz · fridge');
    expect(
      formatPumpStash({
        side: 'both',
        stashCount: 0,
        stashOzPerBottle: null,
        stashLocation: null,
      }),
    ).toBeNull();
  });

  test('parses and serializes bottle source metadata', () => {
    expect(parseBottleNotes('freezer')).toEqual({ source: 'freezer' });
    expect(parseBottleNotes('source=fridge')).toEqual({ source: 'fridge' });
    expect(parseBottleNotes('Freezer stash')).toEqual({ source: 'freezer' });
    expect(parseBottleNotes('stash fridge')).toEqual({ source: 'fridge' });
    expect(serializeBottleNotes({ source: 'formula' })).toBe('source=formula');
    expect(serializeBottleNotes({ source: null })).toBeUndefined();
    expect(formatBottleSource({ source: 'fresh' })).toBe('fresh');
  });

  test('reports stash oz for both pump adds and stash-fed bottle usage', () => {
    expect(
      getEventStashOz({
        type: 'pump',
        notes: 'side=both;stashCount=2;stashOz=4;stashLocation=fridge',
        value: 8,
      }),
    ).toBe(8);
    expect(getEventStashOz({ type: 'bottle', notes: 'source=freezer', value: 4 })).toBe(4);
    expect(getEventStashOz({ type: 'bottle', notes: 'source=formula', value: 4 })).toBe(0);
    expect(getEventStashOz({ type: 'bottle', notes: 'source=fresh', value: 4 })).toBe(0);
  });
});
