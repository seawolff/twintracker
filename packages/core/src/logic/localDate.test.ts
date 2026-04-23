import {
  formatLocalDateInputValue,
  isFutureLocalDateInputValue,
  todayLocalDateInputValue,
} from './localDate';

describe('localDate helpers', () => {
  it('formats a local date for date inputs without UTC conversion', () => {
    expect(formatLocalDateInputValue(new Date(2026, 3, 22, 0, 10, 0))).toBe('2026-04-22');
  });

  it('returns the current local date input value for now', () => {
    expect(todayLocalDateInputValue(new Date(2026, 3, 22, 23, 59, 0))).toBe('2026-04-22');
  });

  it('treats tomorrow as future relative to the local day', () => {
    expect(isFutureLocalDateInputValue('2026-04-23', new Date(2026, 3, 22, 23, 59, 0))).toBe(true);
  });

  it('does not treat today as future relative to the local day', () => {
    expect(isFutureLocalDateInputValue('2026-04-22', new Date(2026, 3, 22, 0, 10, 0))).toBe(
      false,
    );
  });
});
