/**
 * Shared SVG path data for all TwinTracker icons.
 * No SVG library dependency — just raw path definitions consumed by
 * BabyIcons.tsx (react-native-svg) and BabyIcons.web.tsx (plain SVG).
 *
 * Path roles:
 *   fill         — solid fill using the caller's `color` prop
 *   overlay      — translucent overlay fill (inverse of color, 20% alpha)
 *                  used for measurement lines and detail marks
 *   overlayStroke — translucent overlay stroke (same color logic as overlay)
 */

export type PathRole = 'fill' | 'overlay' | 'overlayStroke';

export interface PathDef {
  d: string;
  role: PathRole;
  strokeWidth?: number;
  strokeLinecap?: string;
}

export interface IconDef {
  viewBox: string;
  paths: PathDef[];
}

export const iconDefs = {
  /** Baby bottle — custom Material-style filled icon */
  BottleIcon: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M10 1h4v2h-4z', role: 'fill' },
      { d: 'M7 4h10v2H7z', role: 'fill' },
      { d: 'M6 7h12v11a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V7z', role: 'fill' },
      { d: 'M9 11h2v1H9zm0 3h3v1H9z', role: 'overlay' },
    ],
  },
  /** Diaper — hourglass silhouette with tape tabs (Noun Project-inspired, Material style) */
  DiaperIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M2 5C2 4.45 2.45 4 3 4h18c.55 0 1 .45 1 1v3.5c0 .55-.2 1.05-.55 1.42L19 12l2.45 2.08c.35.37.55.87.55 1.42V19c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1v-3.5c0-.55.2-1.05.55-1.42L5 12 2.55 9.92C2.2 9.55 2 9.05 2 8.5V5z',
        role: 'fill',
      },
      { d: 'M12 9v6', role: 'overlayStroke', strokeWidth: 1.5, strokeLinecap: 'round' },
    ],
  },
  /** bedtime — crescent moon for naps (Material Icons) */
  MoonIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z',
        role: 'fill',
      },
    ],
  },
  /** hotel — bed for night sleep (Material Icons) */
  HotelIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
        role: 'fill',
      },
    ],
  },
  /** restaurant — fork & knife for solid food (Material Icons) */
  FoodIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
        role: 'fill',
      },
    ],
  },
  /** emoji_events — trophy for milestones (Material Icons) */
  MilestoneIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M19 5h-2V3H7v2H5C3.9 5 3 5.9 3 7v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7C21 5.9 20.1 5 19 5zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
        role: 'fill',
      },
    ],
  },
  /** more_vert — vertical three-dot menu (Material Icons) */
  MoreVertIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
        role: 'fill',
      },
    ],
  },
  /** bar_chart — three bars for analytics (Material Icons) */
  BarChartIcon: {
    viewBox: '0 0 24 24',
    paths: [{ d: 'M4 9h4v11H4zM10 4h4v16h-4zM16 13h4v7h-4z', role: 'fill' }],
  },
  /** medication — pill cross for medicine (Material Icons) */
  MedicineIcon: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M6 3h12v2H6z', role: 'fill' },
      {
        d: 'M17 6H7C5.9 6 5 6.9 5 8v11c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 9h-2.5v2.5h-3V15H8v-3h2.5V9.5h3V12H16v3z',
        role: 'fill',
      },
    ],
  },
  /** light_mode — sun for wake (Material Symbols Rounded, 960-unit space) */
  SunIcon: {
    viewBox: '0 -960 960 960',
    paths: [
      {
        d: 'M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM80-440q-17 0-28.5-11.5T40-480q0-17 11.5-28.5T80-520h80q17 0 28.5 11.5T200-480q0 17-11.5 28.5T160-440H80Zm720 0q-17 0-28.5-11.5T760-480q0-17 11.5-28.5T800-520h80q17 0 28.5 11.5T920-480q0 17-11.5 28.5T880-440h-80ZM480-760q-17 0-28.5-11.5T440-800v-80q0-17 11.5-28.5T480-920q17 0 28.5 11.5T520-880v80q0 17-11.5 28.5T480-760Zm0 720q-17 0-28.5-11.5T440-80v-80q0-17 11.5-28.5T480-200q17 0 28.5 11.5T520-160v80q0 17-11.5 28.5T480-40ZM226-678l-43-42q-12-11-11.5-28t11.5-29q12-12 29-12t28 12l42 43q11 12 11 28t-11 28q-11 12-27.5 11.5T226-678Zm494 495-42-43q-11-12-11-28.5t11-27.5q11-12 27.5-11.5T734-282l43 42q12 11 11.5 28T777-183q-12 12-29 12t-28-12Zm-42-495q-12-11-11.5-27.5T678-734l42-43q11-12 28-11.5t29 11.5q12 12 12 29t-12 28l-43 42q-12 11-28 11t-28-11ZM183-183q-12-12-12-29t12-28l43-42q12-11 28.5-11t27.5 11q12 11 11.5 27.5T282-226l-42 43q-11 12-28 11.5T183-183Zm297-297Z',
        role: 'fill',
      },
    ],
  },
  /** water_drop — droplet for nursing (Material Symbols Rounded, 960-unit space) */
  NursingIcon: {
    viewBox: '0 -960 960 960',
    paths: [
      {
        d: 'M480-80q-137 0-228.5-94T160-408q0-62 28-124t70-119q42-57 91-107t91-87q8-8 18.5-11.5T480-860q11 0 21.5 3.5T520-845q42 37 91 87t91 107q42 57 70 119t28 124q0 140-91.5 234T480-80Zm0-80q104 0 172-70.5T720-408q0-73-60.5-165T480-774Q361-665 300.5-573T240-408q0 107 68 177.5T480-160Zm0-320Zm11 280q12-1 20.5-9.5T520-230q0-14-9-22.5t-23-7.5q-41 3-87-22.5T343-375q-2-11-10.5-18t-19.5-7q-14 0-23 10.5t-6 24.5q17 91 80 130t127 35Z',
        role: 'fill',
      },
    ],
  },
  /** close — X for dismiss/close (Material Icons) */
  CloseIcon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        role: 'fill',
      },
    ],
  },
  /** timer — countdown timer (Material Symbols Rounded, 960-unit space) */
  TimerIcon: {
    viewBox: '0 -960 960 960',
    paths: [
      {
        d: 'M400-840q-17 0-28.5-11.5T360-880q0-17 11.5-28.5T400-920h160q17 0 28.5 11.5T600-880q0 17-11.5 28.5T560-840H400Zm80 440q17 0 28.5-11.5T520-440v-160q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600v160q0 17 11.5 28.5T480-400Zm0 320q-74 0-139.5-28.5T226-186q-49-49-77.5-114.5T120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l28-28q11-11 28-11t28 11q11 11 11 28t-11 28l-28 28q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm0-80q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-280Z',
        role: 'fill',
      },
    ],
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof iconDefs;

/** Compute inverse-overlay color (translucent detail marks on top of fill). */
export function overlayColor(color: string): string {
  return color === '#ffffff' || color === '#fff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
}
