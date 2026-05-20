import { BABY_COLOR_HEX, babyColorHex } from '../babyColors';

describe('babyColorHex', () => {
  it('maps every household baby color to its shared identity bullet hex', () => {
    expect(BABY_COLOR_HEX).toEqual({
      amber: '#f59e0b',
      emerald: '#10b981',
      slate: '#64748b',
      rose: '#fb7185',
      sky: '#38bdf8',
      violet: '#8b5cf6',
    });
  });

  it('falls back to slate when a color is missing or unknown', () => {
    expect(babyColorHex(undefined)).toBe('#64748b');
    expect(babyColorHex('unknown')).toBe('#64748b');
  });
});
