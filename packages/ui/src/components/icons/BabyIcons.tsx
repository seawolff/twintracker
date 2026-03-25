/**
 * TwinTracker icons — native (react-native-svg) implementation.
 * Path data lives in iconDefs.ts; this file is the react-native-svg wrapper.
 * On web, next.config.js prefers BabyIcons.web.tsx over this file automatically.
 *
 * Icon sources:
 *  - Material Icons (filled, 24px): github.com/google/material-design-icons (Apache 2.0)
 *  - Material Symbols (rounded): fonts.google.com/icons (Apache 2.0)
 *  - Custom: BottleIcon, DiaperIcon (no suitable Material equivalent)
 */
import Svg, { Path } from 'react-native-svg';
import { iconDefs, overlayColor } from './iconDefs';
import type { IconName } from './iconDefs';

interface IconProps {
  size?: number;
  color?: string;
}

function makeIcon(name: IconName) {
  const def = iconDefs[name];
  return function Icon({ size = 20, color = '#000000' }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox={def.viewBox}>
        {def.paths.map((p, i) => {
          if (p.role === 'fill') {
            return <Path key={i} d={p.d} fill={color} />;
          }
          if (p.role === 'overlay') {
            return <Path key={i} d={p.d} fill={overlayColor(color)} />;
          }
          // overlayStroke
          return (
            <Path
              key={i}
              d={p.d}
              fill="none"
              stroke={overlayColor(color)}
              strokeWidth={p.strokeWidth ?? 1.5}
              strokeLinecap={(p.strokeLinecap as 'round' | 'butt' | 'square') ?? 'round'}
            />
          );
        })}
      </Svg>
    );
  };
}

export const BottleIcon = makeIcon('BottleIcon');
export const DiaperIcon = makeIcon('DiaperIcon');
export const MoonIcon = makeIcon('MoonIcon');
export const HotelIcon = makeIcon('HotelIcon');
export const FoodIcon = makeIcon('FoodIcon');
export const MilestoneIcon = makeIcon('MilestoneIcon');
export const MoreVertIcon = makeIcon('MoreVertIcon');
export const BarChartIcon = makeIcon('BarChartIcon');
export const MedicineIcon = makeIcon('MedicineIcon');
export const SunIcon = makeIcon('SunIcon');
export const NursingIcon = makeIcon('NursingIcon');
export const CloseIcon = makeIcon('CloseIcon');
export const TimerIcon = makeIcon('TimerIcon');
