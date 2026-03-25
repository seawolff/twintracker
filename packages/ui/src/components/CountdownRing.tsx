import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { Urgency } from '@tt/core';
import { useThemeContext } from '@tt/core';
import { fonts } from '../theme/tokens';

export interface CountdownRingProps {
  targetMs: number;
  totalMs: number;
  urgency: Urgency;
  size?: number;
  /** solid = Baby A (filled stroke), dashed = Baby B (dashed stroke) */
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
  size = 140,
  variant = 'solid',
}: CountdownRingProps) {
  const theme = useThemeContext();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
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

  // Dashed pattern for Baby B
  const dashArray =
    variant === 'dashed'
      ? `${circumference * 0.12} ${circumference * 0.05}`
      : `${circumference} ${circumference}`;

  return (
    <View style={styles.container} accessibilityLabel={`Countdown: ${label}`}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={dashArray}
          strokeDashoffset={variant === 'solid' ? dashOffset : 0}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cy}`}
          opacity={variant === 'dashed' ? 0.65 : 1}
        />
        {/* Center label */}
        <SvgText
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={isOverdue ? 18 : 26}
          fontFamily={fonts.mono}
          fill={strokeColor}
          fontWeight="600"
        >
          {label}
        </SvgText>
      </Svg>
    </View>
  );
}

CountdownRing.propTypes = {
  targetMs: PropTypes.number.isRequired,
  totalMs: PropTypes.number.isRequired,
  urgency: PropTypes.oneOf(['ok', 'soon', 'overdue'] as const).isRequired,
  size: PropTypes.number,
  variant: PropTypes.oneOf(['solid', 'dashed'] as const),
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
