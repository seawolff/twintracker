/**
 * TwinTracker icons — web (plain SVG) implementation.
 * Path data lives in iconDefs.ts; this file is the HTML <svg> wrapper.
 * next.config.js prefers .web.tsx over .tsx automatically on web.
 *
 * `color` defaults to 'currentColor' so icons inherit CSS color from context.
 */
import { iconDefs, overlayColor } from './iconDefs';
import type { IconName } from './iconDefs';

interface IconProps {
  size?: number;
  color?: string;
}

function makeIcon(name: IconName) {
  const def = iconDefs[name];
  return function Icon({ size = 20, color = 'currentColor' }: IconProps) {
    return (
      <svg width={size} height={size} viewBox={def.viewBox} aria-hidden="true">
        {def.paths.map((p, i) => {
          if (p.role === 'fill') {
            return <path key={i} d={p.d} fill={color} />;
          }
          if (p.role === 'overlay') {
            // Only render overlay details when a concrete color is provided —
            // currentColor can't be inspected to compute inverse overlay.
            if (color === 'currentColor') {
              return null;
            }
            return <path key={i} d={p.d} fill={overlayColor(color)} />;
          }
          // overlayStroke
          if (color === 'currentColor') {
            return null;
          }
          return (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={overlayColor(color)}
              strokeWidth={p.strokeWidth ?? 1.5}
              strokeLinecap={
                (p.strokeLinecap as 'round' | 'butt' | 'square' | 'inherit') ?? 'round'
              }
            />
          );
        })}
      </svg>
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
