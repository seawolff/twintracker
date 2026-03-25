import { useEffect, useState } from 'react';

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
// Overrides time-based mode — true while any baby has an active nap/sleep event.
let _sleepActive = false;
const _listeners = new Set<() => void>();

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
 * Call from app components when any baby has an active nap or sleep event.
 * Immediately overrides the time-based theme to night mode while true.
 */
export function setSleepActive(active: boolean): void {
  if (_sleepActive !== active) {
    _sleepActive = active;
    _listeners.forEach(fn => fn());
  }
}

function getMode(): ThemeMode {
  if (_sleepActive) {
    return 'night';
  }
  const h = new Date().getHours();
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
