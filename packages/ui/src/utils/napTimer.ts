/** Shared utilities for the NapTimerModal (native + web). */
export { formatTime12 as fmtTime } from '@tt/core';

/** Convert a touch/mouse position to a 0–360° angle around a ring center. */
export function posToAngle(x: number, y: number, cx: number, cy: number): number {
  let a = Math.atan2(y - cy, x - cx) * (180 / Math.PI) + 90;
  if (a < 0) {
    a += 360;
  }
  return a % 360;
}

/** Format milliseconds as MM:SS countdown string. */
export function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
