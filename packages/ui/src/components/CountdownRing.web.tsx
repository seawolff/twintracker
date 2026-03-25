import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useThemeContext } from '@tt/core';
import { fonts } from '../theme/tokens';
import type { Urgency } from '@tt/core';

export interface CountdownRingProps {
  targetMs: number;
  totalMs: number;
  urgency: Urgency;
  size?: number;
  variant?: 'solid' | 'dashed';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return 'overdue';
  }
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function CountdownRing({
  targetMs,
  totalMs,
  urgency,
  size = 120,
  variant = 'solid',
}: CountdownRingProps) {
  const theme = useThemeContext();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const strokeWidth = 8;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, targetMs / totalMs));
  const dashOffset = circumference * (1 - progress);

  const strokeColor =
    urgency === 'overdue'
      ? theme.urgencyOverdue
      : urgency === 'soon'
        ? theme.urgencySoon
        : theme.urgencyOk;

  const isOverdue = targetMs <= 0;
  const label = isOverdue ? 'overdue' : formatCountdown(targetMs);
  const cx = size / 2;
  const cy = size / 2;

  // Dashed: Baby B uses a dotted/dashed pattern at reduced opacity
  const progressDashArray =
    variant === 'dashed'
      ? `${circumference * 0.12} ${circumference * 0.05}`
      : `${circumference} ${circumference}`;
  const progressDashOffset = variant === 'solid' ? dashOffset : 0;
  const progressOpacity = variant === 'dashed' ? 0.65 : 1;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      aria-label={`Countdown: ${label}`}
    >
      <svg width={size} height={size}>
        {/* Background track */}
        <circle cx={cx} cy={cy} r={r} stroke={theme.border} strokeWidth={strokeWidth} fill="none" />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={progressDashArray}
          strokeDashoffset={progressDashOffset}
          strokeLinecap="round"
          opacity={progressOpacity}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Center label */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={isOverdue ? 18 : 26}
          fontFamily={fonts.mono}
          fill={strokeColor}
          fontWeight="600"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

CountdownRing.propTypes = {
  targetMs: PropTypes.number.isRequired,
  totalMs: PropTypes.number.isRequired,
  urgency: PropTypes.oneOf(['ok', 'soon', 'overdue'] as const).isRequired,
  size: PropTypes.number,
  variant: PropTypes.oneOf(['solid', 'dashed'] as const),
};
