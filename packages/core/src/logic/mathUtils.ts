/** Shared math utilities for schedule/analytics computations. */

/**
 * Returns the median of `values`, or null if fewer than `minPoints` values are provided.
 * @param minPoints Minimum data points required — 1 for analytics aggregates, 3 for learned-stats medians.
 */
export function median(values: number[], minPoints = 1): number | null {
  if (values.length < minPoints) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
