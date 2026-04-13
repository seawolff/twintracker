/**
 * Hand-rolled SVG bar chart for per-day trend data.
 * Uses CSS variables so bars automatically flip with the day/night theme.
 * No external charting library — zero bundle cost.
 */
'use client';
import type { TrendPoint } from '@tt/core';

interface TrendBarsProps {
  data: TrendPoint[];
  /** Height of the SVG in px. Default 64. */
  height?: number;
  /**
   * Optional constant benchmark value drawn as a dashed horizontal line.
   * Should be in the same unit as data values.
   */
  benchmarkValue?: number;
  /** Accessible label for the chart (used as aria-label on the svg). */
  ariaLabel: string;
}

const BAR_GAP_RATIO = 0.3; // fraction of bar slot used as gap

export default function TrendBars({
  data,
  height = 64,
  benchmarkValue,
  ariaLabel,
}: TrendBarsProps) {
  const nonNull = data.map(p => p.value).filter((v): v is number => v !== null);
  if (nonNull.length === 0) {
    return <div style={{ height }} />;
  }

  const maxVal = Math.max(...nonNull, benchmarkValue ?? 0);
  const count = data.length;
  // Reserve a few px at top so the tallest bar doesn't touch the SVG edge.
  const topPad = 4;
  const drawH = height - topPad;

  const slotW = 100 / count; // percentage width per slot
  const barW = slotW * (1 - BAR_GAP_RATIO);
  const gapW = slotW * BAR_GAP_RATIO;

  function barHeight(val: number): number {
    return maxVal > 0 ? (val / maxVal) * drawH : 0;
  }

  const benchmarkY =
    benchmarkValue !== undefined && maxVal > 0
      ? topPad + drawH - (benchmarkValue / maxVal) * drawH
      : null;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel}
      role="img"
    >
      {data.map((point, i) => {
        if (point.value === null) {
          return null;
        }
        const bh = barHeight(point.value);
        const x = i * slotW + gapW / 2;
        const y = topPad + drawH - bh;
        return (
          <rect
            key={point.dayMs}
            x={`${x}%`}
            y={y}
            width={`${barW}%`}
            height={bh}
            style={{ fill: 'var(--tt-text)', opacity: 0.7 }}
            rx={1.5}
          />
        );
      })}

      {benchmarkY !== null && (
        <line
          x1="0"
          y1={benchmarkY}
          x2="100%"
          y2={benchmarkY}
          style={{ stroke: 'var(--tt-text)', opacity: 0.35 }}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
    </svg>
  );
}
