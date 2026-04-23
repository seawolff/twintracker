import { useEffect, useState } from 'react';
import type { LatestEventMap } from '../types';

export type ThemeMode = 'day' | 'night';

export interface ThemeTokens {
  mode: ThemeMode;
  // Backgrounds
  bg: string;
  surface: string;
  border: string;
  // Text
  text: string;
  textDim: string;
  textMuted: string;
  // Accent (primary interactive / ring color)
  accent: string;
  accentFaint: string; // accent at ~20% opacity for Baby B distinction
  // Urgency
  urgencyOk: string;
  urgencySoon: string;
  urgencyOverdue: string;
  // Fonts
  fontDisplay: string;
  fontMono: string;
}

const DAY: ThemeTokens = {
  mode: 'day',
  bg: '#ffffff',
  surface: '#f5f5f5',
  border: '#e0e0e0',
  text: '#000000',
  textDim: '#555555',
  textMuted: '#aaaaaa',
  accent: '#000000',
  accentFaint: 'rgba(0,0,0,0.25)',
  urgencyOk: '#888888',
  urgencySoon: '#222222',
  urgencyOverdue: '#000000',
  fontDisplay: 'Fraunces, serif',
  fontMono: 'DM Mono, monospace',
};

const NIGHT: ThemeTokens = {
  mode: 'night',
  bg: '#000000',
  surface: '#1a1a1a',
  border: '#2a2a2a',
  text: '#ffffff',
  textDim: '#aaaaaa',
  textMuted: '#555555',
  accent: '#ffffff',
  accentFaint: 'rgba(255,255,255,0.25)',
  urgencyOk: '#888888',
  urgencySoon: '#dddddd',
  urgencyOverdue: '#ffffff',
  fontDisplay: 'Fraunces, serif',
  fontMono: 'DM Mono, monospace',
};

// Module-level night boundaries — updated via setNightBoundaries() from app prefs.
// Defaults match research: 7am wake, 7pm (19:00) bedtime (Stage 2+).
let _wakeHour = 7;
let _bedtimeHour = 19;
// Landing/demo can temporarily force a theme regardless of real sleep data.
let _manualOverride: ThemeMode | null = null;
// Home/app pages feed these anchors from the latest real 'sleep' events in the household.
let _latestSleepStartMs = 0;
let _latestSleepEndMs = 0;
const _listeners = new Set<() => void>();

function getMostRecentBedtimeBoundaryMs(now: Date, bedtimeHour: number): number {
  const boundary = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    bedtimeHour,
    0,
    0,
    0,
  );
  if (now.getTime() < boundary.getTime()) {
    boundary.setDate(boundary.getDate() - 1);
  }
  return boundary.getTime();
}

export function getSleepThemeAnchors(
  babyIds: string[],
  latest: LatestEventMap,
): { latestSleepStartMs: number; latestSleepEndMs: number } {
  let latestSleepStartMs = 0;
  let latestSleepEndMs = 0;

  for (const babyId of babyIds) {
    const sleepEvent = latest[`${babyId}:sleep`];
    if (!sleepEvent) {
      continue;
    }
    const startedAtMs = new Date(sleepEvent.startedAt).getTime();
    if (startedAtMs > latestSleepStartMs) {
      latestSleepStartMs = startedAtMs;
    }
    if (sleepEvent.endedAt) {
      const endedAtMs = new Date(sleepEvent.endedAt).getTime();
      if (endedAtMs > latestSleepEndMs) {
        latestSleepEndMs = endedAtMs;
      }
    }
  }

  return { latestSleepStartMs, latestSleepEndMs };
}

export function getSleepThemeOverride(
  latestSleepStartMs: number,
  latestSleepEndMs: number,
  now: Date,
  bedtimeHour: number,
): ThemeMode | null {
  const bedtimeBoundaryMs = getMostRecentBedtimeBoundaryMs(now, bedtimeHour);
  const hasRecentSleepStart = latestSleepStartMs >= bedtimeBoundaryMs;
  const hasRecentSleepEnd = latestSleepEndMs >= bedtimeBoundaryMs;

  if (!hasRecentSleepStart && !hasRecentSleepEnd) {
    return null;
  }

  return latestSleepEndMs > latestSleepStartMs ? 'day' : 'night';
}

/**
 * Call from app components when bedtime/wake preferences change.
 * Triggers an immediate theme re-evaluation in all useTheme subscribers.
 */
export function setNightBoundaries(wakeHour: number, bedtimeHour: number): void {
  if (_wakeHour !== wakeHour || _bedtimeHour !== bedtimeHour) {
    _wakeHour = wakeHour;
    _bedtimeHour = bedtimeHour;
    _listeners.forEach(fn => fn());
  }
}

/**
 * Call from landing/demo surfaces that need a direct theme override independent
 * of the real event stream.
 */
export function setSleepActive(active: boolean): void {
  const next = active ? 'night' : null;
  if (_manualOverride !== next) {
    _manualOverride = next;
    _listeners.forEach(fn => fn());
  }
}

/**
 * Call from the real app after deriving the most recent household sleep start/end timestamps.
 * `getMode()` uses these anchors together with the current bedtime boundary so an actual
 * sleep start can force night early, and an actual sleep end can force day early.
 */
export function setSleepThemeAnchors(latestSleepStartMs: number, latestSleepEndMs: number): void {
  if (
    _latestSleepStartMs !== latestSleepStartMs ||
    _latestSleepEndMs !== latestSleepEndMs
  ) {
    _latestSleepStartMs = latestSleepStartMs;
    _latestSleepEndMs = latestSleepEndMs;
    _listeners.forEach(fn => fn());
  }
}

function getMode(): ThemeMode {
  if (_manualOverride) {
    return _manualOverride;
  }
  const now = new Date();
  const sleepOverride = getSleepThemeOverride(_latestSleepStartMs, _latestSleepEndMs, now, _bedtimeHour);
  if (sleepOverride) {
    return sleepOverride;
  }
  const h = now.getHours();
  return h >= _wakeHour && h < _bedtimeHour ? 'day' : 'night';
}

export function getThemeTokens(): ThemeTokens {
  return getMode() === 'day' ? DAY : NIGHT;
}

/** Returns theme tokens that auto-update at the top of each minute and on boundary changes. */
export function useTheme(): ThemeTokens {
  // Start with DAY as a stable SSR default — avoids server/client hydration mismatch
  // when the server (e.g. UTC in Docker) is in a different timezone than the browser.
  const [tokens, setTokens] = useState<ThemeTokens>(DAY);

  useEffect(() => {
    function tick() {
      setTokens(getThemeTokens());
    }
    // Immediately correct to actual local time after hydration
    tick();
    // Re-evaluate when user changes bedtime/wake settings
    _listeners.add(tick);
    // Align subsequent ticks to the next minute boundary
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let intervalId: ReturnType<typeof setInterval>;
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, msUntilNextMinute);
    return () => {
      _listeners.delete(tick);
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  return tokens;
}
