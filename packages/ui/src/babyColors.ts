import type { BabyColor } from '@tt/core';

/** Hex values for each household baby color, shared across web and native UI. */
export const BABY_COLOR_HEX: Record<BabyColor, string> = {
  amber: '#f59e0b',
  emerald: '#10b981',
  slate: '#64748b',
  rose: '#fb7185',
  sky: '#38bdf8',
  violet: '#8b5cf6',
};

export function babyColorHex(color: BabyColor | string | null | undefined): string {
  return BABY_COLOR_HEX[color as BabyColor] ?? '#64748b';
}
