/**
 * Shared UI configuration constants.
 * Single source of truth for all picker options — imported by web and native.
 */

export const NAP_CHECK_MINUTES = [15, 20, 30] as const;

/** Maximum character length for in-app feedback messages. */
export const FEEDBACK_MAX_MESSAGE_LENGTH = 2000;
/** Inclusive rating bounds for in-app feedback (1 = worst, 5 = best). */
export const FEEDBACK_MIN_RATING = 1;
export const FEEDBACK_MAX_RATING = 5;
export type NapCheckMinutes = (typeof NAP_CHECK_MINUTES)[number];

/** Stage 1 (0–15 weeks) bedtime — 10pm per sleep training research (~10pm circadian anchor). */
export const STAGE1_BEDTIME_HOUR = 22;

export const BEDTIME_HOURS = [18, 19, 20, 21, 22, 23] as const;
export type BedtimeHour = (typeof BEDTIME_HOURS)[number];

export const WAKE_HOURS = [4, 5, 6, 7, 8] as const;
export type WakeHour = (typeof WAKE_HOURS)[number];

export const BOTTLE_OZ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type BottleOz = (typeof BOTTLE_OZ)[number];
export const BOTTLE_SOURCE_OPTIONS = ['formula', 'fresh', 'fridge', 'freezer'] as const;
export type BottleSource = (typeof BOTTLE_SOURCE_OPTIONS)[number];

/** Maximum oz allowed in the custom bottle input. Exceeding 16 oz is almost certainly a typo. */
export const MAX_BOTTLE_OZ = 16;
/** Pump sessions can reasonably exceed bottle size, especially with twins; keep a typo guard. */
export const MAX_PUMP_OZ = 24;

/** Millilitres per fluid ounce (exact per NIST). */
export const ML_PER_OZ = 29.5735;

/** ml pill options — mirror of BOTTLE_OZ in metric (1oz ≈ 30ml). */
export const BOTTLE_ML = [30, 60, 90, 120, 150, 180, 210, 240] as const;
export type BottleMl = (typeof BOTTLE_ML)[number];

/** ml equivalents of MAX_BOTTLE_OZ / MAX_PUMP_OZ. */
export const MAX_BOTTLE_ML = Math.round(MAX_BOTTLE_OZ * ML_PER_OZ); // 473 ml
export const MAX_PUMP_ML = Math.round(MAX_PUMP_OZ * ML_PER_OZ); // 710 ml

export function ozToMl(oz: number): number {
  return Math.round(oz * ML_PER_OZ);
}
export function mlToOz(ml: number): number {
  return ml / ML_PER_OZ;
}

/** AAP-recommended maximum daily formula intake for infants. */
export const AAP_MAX_DAILY_OZ = 32;

/**
 * Minimum days of data required to enable the Month analytics tab.
 * Week is always enabled (shows a partial-data notice when < 7 days of data).
 * Month requires at least one full week so the comparison is meaningful.
 */
export const MIN_DAYS_FOR_MONTH_VIEW = 7;

export const NURSING_MINUTES = [5, 10, 15, 20, 25, 30, 40] as const;
export type NursingMinutes = (typeof NURSING_MINUTES)[number];

export const NURSING_BREAST_OPTIONS = ['left', 'right'] as const;
export type NursingBreast = (typeof NURSING_BREAST_OPTIONS)[number];

export const PUMP_MINUTES = [5, 10, 15, 20, 25, 30, 40] as const;
export type PumpMinutes = (typeof PUMP_MINUTES)[number];

export const PUMP_SIDE_OPTIONS = ['left', 'right', 'both'] as const;
export type PumpSide = (typeof PUMP_SIDE_OPTIONS)[number];
export const STASH_LOCATION_OPTIONS = ['fridge', 'freezer'] as const;
export type StashLocation = (typeof STASH_LOCATION_OPTIONS)[number];

export const STASH_BOTTLE_COUNTS = [1, 2, 3, 4, 5, 6] as const;
export type StashBottleCount = (typeof STASH_BOTTLE_COUNTS)[number];

export const DIAPER_OPTIONS = ['wet', 'dirty', 'both', 'dry'] as const;
export type DiaperOption = (typeof DIAPER_OPTIONS)[number];

export const TIME_FORMATS = ['12h', '24h'] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClockTime(date: Date, timeFormat: TimeFormat = '12h'): string {
  const h = date.getHours();
  const m = date.getMinutes();
  if (timeFormat === '24h') {
    return `${pad2(h)}:${pad2(m)}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

/** Formats an hour (0–23) as a human-readable label: 0 → "12 AM" or "00:00". */
export function hourLabel(h: number, timeFormat: TimeFormat = '12h'): string {
  if (timeFormat === '24h') {
    return `${pad2(h)}:00`;
  }
  if (h === 0) {
    return '12 AM';
  }
  if (h === 12) {
    return '12 PM';
  }
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
