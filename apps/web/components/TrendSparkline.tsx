/**
 * Hand-rolled SVG sparkline for per-day trend data.
 * Renders a connected polyline with an optional benchmark dashed line.
 * Uses CSS variables so colors automatically flip with the day/night theme.
 */
'use client';
import type { TrendPoint } from '@tt/core';

interface TrendSparklineProps {
  data: TrendPoint[];
  /** Height of the SVG in px. Default 48. */
  height?: number;
  /** Optional constant benchmark value drawn as a dashed horizontal line. */
  benchmarkValue?: number;
  /** Accessible label for the chart. */
  ariaLabel: string;
}

export default function TrendSparkline({
  data,
  height = 48,
  benchmarkValue,
  ariaLabel,
}: TrendSparklineProps) {
  const nonNull = data.map(p => p.value).filter((v): v is number => v !== null);
  if (nonNull.length < 2) {
    return <div style={{ height }} />;
  }

  const maxVal = Math.max(...nonNull, benchmarkValue ?? 0);
  const minVal = Math.min(...nonNull, benchmarkValue ?? Infinity);
  const range = maxVal - minVal || 1;
  const topPad = 4;
  const botPad = 4;
  const drawH = height - topPad - botPad;

  const count = data.length;

  function xPct(i: number): number {
    return count > 1 ? (i / (count - 1)) * 100 : 50;
  }

  function yPx(val: number): number {
    return topPad + drawH - ((val - minVal) / range) * drawH;
  }

  // Build polyline points — skip null gaps (line will break across them).
  const segments: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i].value;
    if (v !== null) {
      current.push(`${xPct(i)}%,${yPx(v)}`);
    } else {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }

  const benchmarkY = benchmarkValue !== undefined ? yPx(Math.min(benchmarkValue, maxVal)) : null;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel}
      role="img"
    >
      {benchmarkY !== null && (
        <line
          x1="0"
          y1={benchmarkY}
          x2="100%"
          y2={benchmarkY}
          style={{ stroke: 'var(--tt-text)', opacity: 0.25 }}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}

      {segments.map((pts, idx) => (
        <polyline
          key={idx}
          points={pts.join(' ')}
          fill="none"
          style={{ stroke: 'var(--tt-text)' }}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* Dots on non-null data points */}
      {data.map((point, i) => {
        if (point.value === null) {
          return null;
        }
        return (
          <circle
            key={point.dayMs}
            cx={`${xPct(i)}%`}
            cy={yPx(point.value)}
            r={2}
            style={{ fill: 'var(--tt-text)' }}
          />
        );
      })}
    </svg>
  );
}
