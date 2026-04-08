/**
 * WHO Child Growth Standards — percentile calculations for weight and height/length.
 *
 * Data source: WHO MGRS (Multicentre Growth Reference Study), 0–24 months.
 * The CDC recommends WHO charts for children under 2 years.
 *
 * Method: LMS Box-Cox power transformation.
 *   - L (Lambda): power transformation to normalise the distribution
 *   - M (Mu):     median measurement at that age
 *   - S (Sigma):  coefficient of variation
 *
 * Z-score: z = ((x/M)^L − 1) / (L × S)   when L ≠ 0
 *          z = ln(x/M) / S                 when L ≈ 0
 *
 * See docs/growth-percentiles.md for full data-source notes.
 */

import type { BabySex } from '../types';

/** [ageMonths, L, M, S] */
type LMSEntry = [number, number, number, number];

// ── Weight-for-age (kg) ──────────────────────────────────────────────────────

/** WHO weight-for-age LMS, boys 0–24 months. */
const WFA_BOYS: LMSEntry[] = [
  [0, 0.3487, 3.3464, 0.14602],
  [1, 0.2297, 4.4709, 0.13395],
  [2, 0.197, 5.5675, 0.12385],
  [3, 0.1738, 6.3762, 0.11727],
  [4, 0.1553, 7.0023, 0.11316],
  [5, 0.1395, 7.5105, 0.1108],
  [6, 0.1257, 7.934, 0.10958],
  [7, 0.1134, 8.297, 0.10902],
  [8, 0.1021, 8.6151, 0.10882],
  [9, 0.0917, 8.9014, 0.10881],
  [10, 0.082, 9.1649, 0.10891],
  [11, 0.073, 9.4122, 0.10906],
  [12, 0.0644, 9.6479, 0.10925],
  [13, 0.0563, 9.8749, 0.10949],
  [14, 0.0487, 10.0953, 0.10976],
  [15, 0.0413, 10.3108, 0.11007],
  [16, 0.0343, 10.5228, 0.11041],
  [17, 0.0275, 10.7319, 0.11079],
  [18, 0.0211, 10.9385, 0.11119],
  [19, 0.0148, 11.143, 0.11164],
  [20, 0.0087, 11.3462, 0.11211],
  [21, 0.0029, 11.5486, 0.11261],
  [22, -0.0028, 11.7504, 0.11314],
  [23, -0.0083, 11.9514, 0.11369],
  [24, -0.0137, 12.1515, 0.11426],
];

/** WHO weight-for-age LMS, girls 0–24 months. */
const WFA_GIRLS: LMSEntry[] = [
  [0, 0.3809, 3.2322, 0.14171],
  [1, 0.1714, 4.1873, 0.13724],
  [2, 0.0962, 5.1282, 0.13],
  [3, 0.0402, 5.8458, 0.12619],
  [4, -0.005, 6.4237, 0.12402],
  [5, -0.043, 6.8985, 0.12274],
  [6, -0.0756, 7.297, 0.12204],
  [7, -0.1039, 7.6422, 0.12178],
  [8, -0.1288, 7.9487, 0.12181],
  [9, -0.1507, 8.2254, 0.12199],
  [10, -0.17, 8.48, 0.12223],
  [11, -0.1872, 8.7192, 0.12247],
  [12, -0.2024, 8.9481, 0.12268],
  [13, -0.2158, 9.1699, 0.12283],
  [14, -0.2278, 9.387, 0.12294],
  [15, -0.2384, 9.6008, 0.12299],
  [16, -0.2478, 9.8124, 0.12303],
  [17, -0.2562, 10.0226, 0.12306],
  [18, -0.2637, 10.2315, 0.12309],
  [19, -0.2703, 10.4393, 0.12315],
  [20, -0.2762, 10.6464, 0.12323],
  [21, -0.2815, 10.8534, 0.12335],
  [22, -0.2862, 11.0608, 0.1235],
  [23, -0.2903, 11.2688, 0.12369],
  [24, -0.2941, 11.4775, 0.1239],
];

// ── Length/height-for-age (cm) ────────────────────────────────────────────────
// L = 1.0 for all length entries (symmetric distribution).

/** WHO length-for-age LMS, boys 0–24 months. */
const LHFA_BOYS: LMSEntry[] = [
  [0, 1, 49.8842, 0.03795],
  [1, 1, 54.7244, 0.03557],
  [2, 1, 58.4249, 0.03424],
  [3, 1, 61.4292, 0.03328],
  [4, 1, 63.886, 0.03257],
  [5, 1, 65.9026, 0.03204],
  [6, 1, 67.6236, 0.03165],
  [7, 1, 69.1645, 0.03139],
  [8, 1, 70.5994, 0.03124],
  [9, 1, 71.9687, 0.03117],
  [10, 1, 73.2812, 0.03118],
  [11, 1, 74.5388, 0.03125],
  [12, 1, 75.7488, 0.03137],
  [13, 1, 76.9186, 0.03154],
  [14, 1, 78.0497, 0.03174],
  [15, 1, 79.1458, 0.03197],
  [16, 1, 80.2113, 0.03222],
  [17, 1, 81.2487, 0.0325],
  [18, 1, 82.2587, 0.03279],
  [19, 1, 83.2418, 0.0331],
  [20, 1, 84.1996, 0.03342],
  [21, 1, 85.1348, 0.03376],
  [22, 1, 86.0477, 0.0341],
  [23, 1, 86.941, 0.03445],
  [24, 1, 87.8161, 0.03479],
];

/** WHO length-for-age LMS, girls 0–24 months. */
const LHFA_GIRLS: LMSEntry[] = [
  [0, 1, 49.1477, 0.0379],
  [1, 1, 53.6872, 0.0364],
  [2, 1, 57.0673, 0.03568],
  [3, 1, 59.8029, 0.0352],
  [4, 1, 62.0899, 0.03486],
  [5, 1, 64.0301, 0.03463],
  [6, 1, 65.7311, 0.03448],
  [7, 1, 67.2873, 0.03441],
  [8, 1, 68.7498, 0.0344],
  [9, 1, 70.1435, 0.03444],
  [10, 1, 71.4818, 0.03452],
  [11, 1, 72.771, 0.03464],
  [12, 1, 74.015, 0.03479],
  [13, 1, 75.2176, 0.03496],
  [14, 1, 76.3817, 0.03514],
  [15, 1, 77.5099, 0.03534],
  [16, 1, 78.6055, 0.03555],
  [17, 1, 79.671, 0.03576],
  [18, 1, 80.7079, 0.03598],
  [19, 1, 81.7182, 0.0362],
  [20, 1, 82.7036, 0.03643],
  [21, 1, 83.6654, 0.03666],
  [22, 1, 84.604, 0.03688],
  [23, 1, 85.5202, 0.03711],
  [24, 1, 86.4153, 0.03734],
];

// ── Core maths ────────────────────────────────────────────────────────────────

/**
 * Abramowitz & Stegun error function approximation (7.1.26).
 * Max absolute error: 1.5 × 10⁻⁷
 */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const sign = x < 0 ? -1 : 1;
  return sign * (1 - poly * Math.exp(-x * x));
}

/** Standard normal cumulative distribution function. */
function normCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * LMS z-score for a measurement.
 * When |L| < ε the formula degenerates — use the log-normal form.
 */
function lmsZScore(x: number, L: number, M: number, S: number): number {
  if (Math.abs(L) < 1e-6) {
    return Math.log(x / M) / S;
  }
  return (Math.pow(x / M, L) - 1) / (L * S);
}

/**
 * Linearly interpolate between two LMS entries for fractional months.
 * Returns [L, M, S] at the given (possibly non-integer) age.
 */
function interpolateLMS(table: LMSEntry[], ageMonths: number): [number, number, number] | null {
  const lo = Math.floor(ageMonths);
  const hi = Math.ceil(ageMonths);

  const loRow = table.find(([m]) => m === lo);
  if (!loRow) {
    return null;
  }
  if (lo === hi) {
    return [loRow[1], loRow[2], loRow[3]];
  }
  const hiRow = table.find(([m]) => m === hi);
  if (!hiRow) {
    return [loRow[1], loRow[2], loRow[3]];
  }
  const frac = ageMonths - lo;
  return [
    loRow[1] + frac * (hiRow[1] - loRow[1]),
    loRow[2] + frac * (hiRow[2] - loRow[2]),
    loRow[3] + frac * (hiRow[3] - loRow[3]),
  ];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute WHO weight-for-age percentile (0–100).
 *
 * @param weightKg  Weight in kilograms.
 * @param ageMonths Age in months (may be fractional).
 * @param sex       'male' | 'female'
 * @returns Percentile 0–100, or null when age > 24 months or data unavailable.
 */
export function computeWeightPercentile(
  weightKg: number,
  ageMonths: number,
  sex: BabySex,
): number | null {
  if (ageMonths < 0 || ageMonths > 24) {
    return null;
  }
  const table = sex === 'male' ? WFA_BOYS : WFA_GIRLS;
  const lms = interpolateLMS(table, ageMonths);
  if (!lms) {
    return null;
  }
  const [L, M, S] = lms;
  const z = lmsZScore(weightKg, L, M, S);
  return Math.min(99.9, Math.max(0.1, normCDF(z) * 100));
}

/**
 * Compute WHO length/height-for-age percentile (0–100).
 *
 * @param heightCm  Height or recumbent length in centimetres.
 * @param ageMonths Age in months (may be fractional).
 * @param sex       'male' | 'female'
 * @returns Percentile 0–100, or null when age > 24 months or data unavailable.
 */
export function computeHeightPercentile(
  heightCm: number,
  ageMonths: number,
  sex: BabySex,
): number | null {
  if (ageMonths < 0 || ageMonths > 24) {
    return null;
  }
  const table = sex === 'male' ? LHFA_BOYS : LHFA_GIRLS;
  const lms = interpolateLMS(table, ageMonths);
  if (!lms) {
    return null;
  }
  const [L, M, S] = lms;
  const z = lmsZScore(heightCm, L, M, S);
  return Math.min(99.9, Math.max(0.1, normCDF(z) * 100));
}

/**
 * Human-readable percentile label, e.g. "34th percentile".
 */
export function formatPercentile(p: number): string {
  const rounded = Math.round(p);
  if (rounded === 1) {
    return '1st percentile';
  }
  if (rounded === 2) {
    return '2nd percentile';
  }
  if (rounded === 3) {
    return '3rd percentile';
  }
  return `${rounded}th percentile`;
}

/**
 * Derive age in whole months from a YYYY-MM-DD birth date and a reference date.
 * Returns null when birthDate is absent or invalid.
 */
export function ageInMonths(birthDate: string | undefined, now: Date = new Date()): number | null {
  if (!birthDate) {
    return null;
  }
  const dob = new Date(birthDate);
  if (isNaN(dob.getTime())) {
    return null;
  }
  const yearDiff = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayFrac = (now.getDate() - dob.getDate()) / 30;
  return Math.max(0, yearDiff * 12 + monthDiff + dayFrac);
}
