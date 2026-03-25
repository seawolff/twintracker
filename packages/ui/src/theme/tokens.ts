/**
 * Design tokens for TwinTracker.
 *
 * B&W palette: white bg in day (06:00–22:00), black bg at night.
 * Colors are sourced from ThemeContext at runtime — do NOT import static
 * color values from here for UI components. Use useThemeContext() instead.
 *
 * This file re-exports theme utilities and provides structural tokens
 * (spacing, radius, fonts) that are the same in both modes.
 */
export { getThemeTokens } from '@tt/core';
export type { ThemeTokens, ThemeMode } from '@tt/core';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8, // ExtraSmall — chips, badges
  md: 12, // Medium — cards, inputs
  lg: 20, // Large — FAB, card variants
  xl: 28, // ExtraLarge — bottom sheets, nav drawer
  full: 9999,
} as const;

export const fonts = {
  // Nunito: rounded, playful — matches "What Does Baby See?" book aesthetic
  display: 'Nunito, sans-serif',
  mono: 'DM Mono, monospace',
} as const;

/**
 * Baby variant — 'solid' for first baby, 'dashed' for second.
 * Maps BabyColor index to stroke style for the countdown ring.
 */
const COLOR_ORDER = ['amber', 'emerald', 'slate', 'rose', 'sky', 'violet'] as const;

export function babyVariant(color: string): 'solid' | 'dashed' {
  const idx = COLOR_ORDER.indexOf(color as (typeof COLOR_ORDER)[number]);
  // Even index → solid, odd index → dashed
  return idx % 2 === 0 ? 'solid' : 'dashed';
}
