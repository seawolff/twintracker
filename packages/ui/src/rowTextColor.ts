/**
 * rowTextColor — greyscale text-colour computation for history rows.
 *
 * Row backgrounds darken (day mode) or lighten (night mode) as row index grows.
 * Text colours hard-flip at TEXT_FLIP_ALPHA — the point where the background is
 * dark/light enough that the inverted palette has better contrast than the normal one.
 * A hard flip avoids the grey-on-grey dead zone that gradual lerps create.
 *
 * Row backgrounds are computed as solid hex (not rgba) so contrast ratios are
 * unambiguous and calculable without knowledge of what's composited behind the row.
 */

/**
 * Overlay alpha at which text colours flip from their normal-theme values to the
 * inverted-theme values. Chosen at the mathematical crossover where the background
 * is dark/light enough that white and black text have approximately equal contrast
 * (~3:1 each) — flipping here minimises the worst-case contrast ratio.
 *
 * With SHADE_PER_ROW=0.015: row 27 (alpha=0.405) keeps normal text,
 * row 28 (alpha=0.420) gets inverted text — no grey intermediate row exists.
 */
export const TEXT_FLIP_ALPHA = 0.415;

/**
 * Greyscale channel values (0-255) for each text level at alpha = 0 (pure bg).
 * Matches the palette tokens exactly so row 0 is always on-brand.
 */
export const NORMAL_GREY = {
  day: { text: 0x00, dim: 0x55, muted: 0xaa }, // #000000 #555555 #aaaaaa
  night: { text: 0xff, dim: 0xaa, muted: 0x55 }, // #ffffff #aaaaaa #555555
} as const;

/**
 * Target greyscale channel values after the flip.
 * All three levels shift toward the same light/dark end so every element — label,
 * time, icon — reads clearly on the darkened/lightened background.
 */
export const INVERTED_GREY = {
  day: { text: 0xff, dim: 0xe8, muted: 0xe8 }, // #ffffff #e8e8e8 #e8e8e8
  night: { text: 0x00, dim: 0x1a, muted: 0x1a }, // #000000 #1a1a1a #1a1a1a
} as const;

/** Linearly interpolate a single 0-255 grey channel; t is clamped to [0, 1]. */
export function lerpChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * Math.max(0, Math.min(1, t)));
}

/**
 * Return a 6-digit grey hex colour (#rrggbb) for a history row at a given overlay
 * alpha. Snaps from normalGrey to invertedGrey at TEXT_FLIP_ALPHA.
 */
export function rowTextGrey(alpha: number, normalGrey: number, invertedGrey: number): string {
  const g = alpha < TEXT_FLIP_ALPHA ? normalGrey : invertedGrey;
  const h = g.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/**
 * Compute the solid hex background colour for a row at a given overlay alpha.
 * Using a solid hex (instead of rgba) makes contrast ratios unambiguous.
 *   Day mode  (white bg, black overlay): channel = 255 × (1 − alpha)
 *   Night mode (black bg, white overlay): channel = 255 × alpha
 */
export function rowBgHex(alpha: number, mode: 'day' | 'night'): string {
  const a = Math.max(0, Math.min(1, alpha));
  const v = mode === 'day' ? Math.round(255 * (1 - a)) : Math.round(255 * a);
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}
