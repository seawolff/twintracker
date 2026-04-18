import {
  computeWeightPercentile,
  computeHeightPercentile,
  formatPercentile,
  ageInMonths,
  kgToLbs,
  lbsToKg,
  cmToIn,
  inToCm,
} from './growthPercentiles';

// ── ageInMonths ───────────────────────────────────────────────────────────────

describe('ageInMonths', () => {
  it('returns null for missing birthDate', () => {
    expect(ageInMonths(undefined)).toBeNull();
    expect(ageInMonths('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(ageInMonths('not-a-date')).toBeNull();
  });

  it('returns ~0 for a newborn (same day)', () => {
    const today = new Date('2025-06-01');
    const result = ageInMonths('2025-06-01', today);
    expect(result).toBeCloseTo(0, 0);
  });

  it('returns ~6 for a 6-month-old', () => {
    const dob = '2025-01-01';
    const now = new Date('2025-07-01');
    const result = ageInMonths(dob, now);
    expect(result).toBeGreaterThanOrEqual(5.9);
    expect(result).toBeLessThanOrEqual(6.1);
  });

  it('returns ~12 for a 1-year-old', () => {
    const result = ageInMonths('2024-01-01', new Date('2025-01-01'));
    expect(result).toBeCloseTo(12, 0);
  });
});

// ── computeWeightPercentile ───────────────────────────────────────────────────

describe('computeWeightPercentile', () => {
  it('returns null for age > 24 months', () => {
    expect(computeWeightPercentile(12, 25, 'male')).toBeNull();
  });

  it('returns null for negative age', () => {
    expect(computeWeightPercentile(3.3, -1, 'male')).toBeNull();
  });

  it('returns ~50th percentile for median WHO weight (newborn boy at 0m)', () => {
    // WHO median for boys at 0 months = 3.3464 kg
    const pct = computeWeightPercentile(3.3464, 0, 'male');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns ~50th percentile for median WHO weight (newborn girl at 0m)', () => {
    // WHO median for girls at 0 months = 3.2322 kg
    const pct = computeWeightPercentile(3.2322, 0, 'female');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns ~50th percentile for median weight at 12 months (boy)', () => {
    // WHO median for boys at 12 months = 9.6479 kg
    const pct = computeWeightPercentile(9.6479, 12, 'male');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns low percentile for underweight baby', () => {
    // A 6-month-old boy weighing 5 kg (well below median ~7.93 kg)
    const pct = computeWeightPercentile(5, 6, 'male');
    expect(pct).not.toBeNull();
    expect(pct!).toBeLessThan(5);
  });

  it('returns high percentile for heavy baby', () => {
    // A 6-month-old boy weighing 11 kg (well above median ~7.93 kg)
    const pct = computeWeightPercentile(11, 6, 'male');
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(95);
  });

  it('interpolates between whole-month ages', () => {
    const at6 = computeWeightPercentile(7.934, 6, 'male');
    const at7 = computeWeightPercentile(7.934, 7, 'male');
    const at65 = computeWeightPercentile(7.934, 6.5, 'male');
    expect(at65).not.toBeNull();
    expect(at65!).toBeGreaterThan(Math.min(at6!, at7!) - 1);
    expect(at65!).toBeLessThan(Math.max(at6!, at7!) + 1);
  });

  it('clamps result to 0.1–99.9', () => {
    // Absurdly heavy baby
    const high = computeWeightPercentile(50, 6, 'male');
    expect(high).toBeLessThanOrEqual(99.9);

    // Absurdly light baby
    const low = computeWeightPercentile(0.1, 6, 'male');
    expect(low).toBeGreaterThanOrEqual(0.1);
  });
});

// ── computeHeightPercentile ───────────────────────────────────────────────────

describe('computeHeightPercentile', () => {
  it('returns null for age > 24 months', () => {
    expect(computeHeightPercentile(90, 25, 'female')).toBeNull();
  });

  it('returns ~50th percentile for median WHO length (newborn boy)', () => {
    // WHO median for boys at 0 months = 49.8842 cm
    const pct = computeHeightPercentile(49.8842, 0, 'male');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns ~50th percentile for median WHO length (newborn girl)', () => {
    // WHO median for girls at 0 months = 49.1477 cm
    const pct = computeHeightPercentile(49.1477, 0, 'female');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns ~50th percentile for median length at 12 months (girl)', () => {
    // WHO median for girls at 12 months = 74.015 cm
    const pct = computeHeightPercentile(74.015, 12, 'female');
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 0);
  });

  it('returns low percentile for short baby', () => {
    // A 12-month-old girl at 65 cm (well below median 74 cm)
    const pct = computeHeightPercentile(65, 12, 'female');
    expect(pct).not.toBeNull();
    expect(pct!).toBeLessThan(5);
  });

  it('returns high percentile for tall baby', () => {
    // A 12-month-old girl at 83 cm (well above median 74 cm)
    const pct = computeHeightPercentile(83, 12, 'female');
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(95);
  });
});

// ── formatPercentile ──────────────────────────────────────────────────────────

describe('formatPercentile', () => {
  it('formats 1st correctly', () => {
    expect(formatPercentile(1)).toBe('1st percentile');
  });

  it('formats 2nd correctly', () => {
    expect(formatPercentile(2)).toBe('2nd percentile');
  });

  it('formats 3rd correctly', () => {
    expect(formatPercentile(3)).toBe('3rd percentile');
  });

  it('formats other values with "th"', () => {
    expect(formatPercentile(50)).toBe('50th percentile');
    expect(formatPercentile(75)).toBe('75th percentile');
    expect(formatPercentile(97)).toBe('97th percentile');
  });

  it('rounds fractional values', () => {
    expect(formatPercentile(49.7)).toBe('50th percentile');
    expect(formatPercentile(74.2)).toBe('74th percentile');
  });
});

// ── Unit conversion helpers ───────────────────────────────────────────────────

describe('kgToLbs / lbsToKg', () => {
  it('converts 1 kg to ~2.205 lbs', () => {
    expect(kgToLbs(1)).toBeCloseTo(2.205, 2);
  });

  it('round-trips kg → lbs → kg', () => {
    expect(lbsToKg(kgToLbs(5.2))).toBeCloseTo(5.2, 4);
  });

  it('returns 0 for 0 kg', () => {
    expect(kgToLbs(0)).toBe(0);
  });
});

describe('cmToIn / inToCm', () => {
  it('converts 2.54 cm to exactly 1 inch', () => {
    expect(cmToIn(2.54)).toBeCloseTo(1, 5);
  });

  it('round-trips cm → in → cm', () => {
    expect(inToCm(cmToIn(62))).toBeCloseTo(62, 4);
  });

  it('returns 0 for 0 cm', () => {
    expect(cmToIn(0)).toBe(0);
  });
});
