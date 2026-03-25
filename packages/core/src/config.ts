/**
 * Shared UI configuration constants.
 * Single source of truth for all picker options — imported by web and native.
 */

export const NAP_CHECK_MINUTES = [15, 20, 30] as const;
export type NapCheckMinutes = (typeof NAP_CHECK_MINUTES)[number];

export const BEDTIME_HOURS = [18, 19, 20, 21, 22] as const;
export type BedtimeHour = (typeof BEDTIME_HOURS)[number];

export const WAKE_HOURS = [5, 6, 7, 8] as const;
export type WakeHour = (typeof WAKE_HOURS)[number];

export const BOTTLE_OZ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type BottleOz = (typeof BOTTLE_OZ)[number];

export const NURSING_MINUTES = [5, 10, 15, 20, 25, 30, 40] as const;
export type NursingMinutes = (typeof NURSING_MINUTES)[number];

export const DIAPER_OPTIONS = ['wet', 'dirty', 'both'] as const;
export type DiaperOption = (typeof DIAPER_OPTIONS)[number];

/** Formats an hour (0–23) as a human-readable 12-hour label: 0 → "12 AM", 19 → "7 PM". */
export function hourLabel(h: number): string {
  if (h === 0) {
    return '12 AM';
  }
  if (h === 12) {
    return '12 PM';
  }
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
