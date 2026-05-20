import { getBirthDatePickerInitialDate } from '../components/babyProfileDate';

describe('BabyProfileSheet DOB picker seed', () => {
  it('opens a stored YYYY-MM-DD birth date on the same local calendar day', () => {
    const date = getBirthDatePickerInitialDate('2026-04-29');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3);
    expect(date.getDate()).toBe(29);
    expect(date.getHours()).toBe(12);
  });

  it('falls back to the provided date when no birth date exists', () => {
    const fallback = new Date(2026, 3, 28, 9, 30, 0);
    const date = getBirthDatePickerInitialDate('', fallback);
    expect(date).toBe(fallback);
  });
});
