/**
 * authorUtils tests — verifies authorColor returns deterministic values
 * from the defined palette.
 */

import { authorColor } from './authorUtils';

const PALETTE = [
  '#E57373',
  '#81C784',
  '#64B5F6',
  '#FFB74D',
  '#BA68C8',
  '#4DB6AC',
  '#F06292',
  '#90A4AE',
];

describe('authorColor', () => {
  it('returns a color from the defined palette', () => {
    expect(PALETTE).toContain(authorColor('Mom'));
    expect(PALETTE).toContain(authorColor('Dad'));
    expect(PALETTE).toContain(authorColor(''));
  });

  it('is deterministic — same name always returns the same color', () => {
    expect(authorColor('Mom')).toBe(authorColor('Mom'));
    expect(authorColor('Dad')).toBe(authorColor('Dad'));
    expect(authorColor('Grandma')).toBe(authorColor('Grandma'));
  });

  it('different names can produce different colors', () => {
    // Not guaranteed for all pairs, but Mom/Dad are known to differ
    const colors = new Set(
      ['Mom', 'Dad', 'Ava', 'Zara', 'Chris', 'Sam', 'Tyler', 'Jordan'].map(authorColor),
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it('handles empty string without throwing', () => {
    expect(() => authorColor('')).not.toThrow();
    expect(PALETTE).toContain(authorColor(''));
  });

  it('handles long names without throwing', () => {
    const longName = 'A'.repeat(1000);
    expect(() => authorColor(longName)).not.toThrow();
    expect(PALETTE).toContain(authorColor(longName));
  });

  it('returns a hex color string', () => {
    expect(authorColor('Mom')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
