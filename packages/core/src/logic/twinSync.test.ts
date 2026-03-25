import { getNapActionType } from './twinSync';

describe('getNapActionType', () => {
  describe('when waking — active nap', () => {
    it('returns "nap" when nap is active (daytime)', () => {
      expect(getNapActionType(true, false, false)).toBe('nap');
    });

    it('returns "nap" when nap is active even if it were night mode (waking always uses active type)', () => {
      expect(getNapActionType(true, false, true)).toBe('nap');
    });
  });

  describe('when waking — active sleep', () => {
    it('returns "sleep" when sleep is active (night event, daytime wake)', () => {
      // Regression: baby put to sleep at night (type='sleep') but wake pressed in morning
      // when isSleepMode=false. Must still emit 'sleep' so getActiveEvent finds the event.
      expect(getNapActionType(false, true, false)).toBe('sleep');
    });

    it('returns "sleep" when sleep is active during night mode', () => {
      expect(getNapActionType(false, true, true)).toBe('sleep');
    });

    it('prefers sleep type when both nap and sleep appear active', () => {
      // sleepIsActive takes precedence — sleep is the more recent night event
      expect(getNapActionType(true, true, false)).toBe('sleep');
    });
  });

  describe('when starting a new nap/sleep — nothing active', () => {
    it('returns "nap" when not in sleep mode', () => {
      expect(getNapActionType(false, false, false)).toBe('nap');
    });

    it('returns "sleep" when in sleep mode (night or bedtime stretch)', () => {
      expect(getNapActionType(false, false, true)).toBe('sleep');
    });
  });
});
