/**
 * rowTextColor — greyscale background computation tests.
 *
 * Verifies that lerpChannel and rowBgHex produce correct hex values at key
 * points and for both day and night theme modes.
 *
 * rowTextGrey is exported but no longer used by components (they use theme.text
 * directly). Basic shape tests are kept so the export stays exercised.
 */
import { lerpChannel, rowTextGrey, rowBgHex } from '../rowTextColor';

// ── lerpChannel ───────────────────────────────────────────────────────────────

describe('lerpChannel', () => {
  it('returns `from` at t=0', () => {
    expect(lerpChannel(0, 255, 0)).toBe(0);
    expect(lerpChannel(255, 0, 0)).toBe(255);
  });

  it('returns `to` at t=1', () => {
    expect(lerpChannel(0, 255, 1)).toBe(255);
    expect(lerpChannel(255, 0, 1)).toBe(0);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerpChannel(0, 100, 0.5)).toBe(50);
    expect(lerpChannel(100, 0, 0.5)).toBe(50);
  });

  it('clamps t below 0', () => {
    expect(lerpChannel(50, 200, -1)).toBe(50);
  });

  it('clamps t above 1', () => {
    expect(lerpChannel(50, 200, 2)).toBe(200);
  });

  it('rounds to the nearest integer', () => {
    // 0 + (255-0) * 0.3 = 76.5 → rounds to 77
    expect(lerpChannel(0, 255, 0.3)).toBe(77);
  });
});

// ── rowTextGrey ───────────────────────────────────────────────────────────────

describe('rowTextGrey', () => {
  it('output is always a 7-character hex string', () => {
    expect(rowTextGrey(0, 0x00, 0xff)).toMatch(/^#[0-9a-f]{6}$/);
    expect(rowTextGrey(0.5, 0x55, 0xe8)).toMatch(/^#[0-9a-f]{6}$/);
    expect(rowTextGrey(0.9, 0xaa, 0xe8)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns normal colour at alpha=0', () => {
    expect(rowTextGrey(0, 0x00, 0xff)).toBe('#000000');
    expect(rowTextGrey(0, 0xff, 0x00)).toBe('#ffffff');
  });
});

// ── rowBgHex ──────────────────────────────────────────────────────────────────

describe('rowBgHex', () => {
  describe('day mode (white bg darkens toward black)', () => {
    it('returns #ffffff at alpha=0', () => {
      expect(rowBgHex(0, 'day')).toBe('#ffffff');
    });

    it('returns #000000 at alpha=1', () => {
      expect(rowBgHex(1, 'day')).toBe('#000000');
    });

    it('returns mid-grey at alpha=0.5', () => {
      // 255 * (1 - 0.5) = 127.5 → 128 → #808080
      expect(rowBgHex(0.5, 'day')).toBe('#808080');
    });

    it('clamps alpha above 1', () => {
      expect(rowBgHex(2, 'day')).toBe('#000000');
    });

    it('clamps alpha below 0', () => {
      expect(rowBgHex(-1, 'day')).toBe('#ffffff');
    });
  });

  describe('night mode (black bg lightens toward white)', () => {
    it('returns #000000 at alpha=0', () => {
      expect(rowBgHex(0, 'night')).toBe('#000000');
    });

    it('returns #ffffff at alpha=1', () => {
      expect(rowBgHex(1, 'night')).toBe('#ffffff');
    });

    it('returns mid-grey at alpha=0.5', () => {
      // 255 * 0.5 = 127.5 → 128 → #808080
      expect(rowBgHex(0.5, 'night')).toBe('#808080');
    });

    it('clamps alpha above 1', () => {
      expect(rowBgHex(2, 'night')).toBe('#ffffff');
    });

    it('clamps alpha below 0', () => {
      expect(rowBgHex(-1, 'night')).toBe('#000000');
    });
  });

  it('output is always a 7-character hex string', () => {
    expect(rowBgHex(0, 'day')).toMatch(/^#[0-9a-f]{6}$/);
    expect(rowBgHex(0.3, 'night')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
