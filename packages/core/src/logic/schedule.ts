/** Age-aware schedule logic: next action, urgency, and narrative insight for a baby card. */
import type {
  Baby,
  LatestEventMap,
  NextAction,
  PredictedAction,
  TrackerEvent,
  Urgency,
} from '../types/index';
import type { LearnedStats } from './learnedSchedule';

const SOON_THRESHOLD_MS = 5 * 60 * 1000;
export const DIAPER_INTERVAL_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Age-based schedule helpers
// ---------------------------------------------------------------------------

export function getAgeWeeks(birthDate?: string): number {
  if (!birthDate) {
    return 14;
  } // default ~3 months if unknown
  const ms = Date.now() - new Date(birthDate).getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Age-appropriate default formula oz per feed.
 * Source: TwinTrackerSleepTrainingModuleResea.md (research source of truth).
 * Max daily intake ~32 oz; individual needs vary — learned stats override this.
 */
export function getDefaultOzForAge(ageWeeks: number): number {
  if (ageWeeks < 4) {
    return 3;
  } // 0–4w:   2–4 oz/feed → midpoint 3 oz
  if (ageWeeks < 12) {
    return 4;
  } // 1–3m:   4–5 oz/feed
  if (ageWeeks < 24) {
    return 6;
  } // 3–6m:   5–7 oz/feed → midpoint 6 oz
  if (ageWeeks < 52) {
    return 7;
  } // 6–12m:  7–8 oz/feed
  return 6; // 12m+:   decreasing as solids take over; sippy cup
}

/**
 * Returns the sleep training stage for a baby's age.
 * Stage 1 (0–15w): 3-hour Feed→Play→Sleep cycle; late ~10pm bedtime.
 * Stage 2 (16w–18m): 4-hour schedule; two 2-hour crib naps; 7pm bedtime.
 * Stage 3 (18m+): one 2–3h afternoon nap starting 12–2pm.
 * Source: TwinTrackerSleepTrainingModuleResea.md
 */
export function getScheduleStage(ageWeeks: number): 1 | 2 | 3 {
  if (ageWeeks < 16) return 1;
  if (ageWeeks < 78) return 2; // 78w ≈ 18 months
  return 3;
}

/**
 * Age-adaptive interval for diaper-change reminders.
 *
 * Aligned with AAP "check every 2–3h" guidance scaled by age:
 *   0–4w:   1.5h — newborns wet after almost every feed (feeds q2–3h)
 *   4–8w:   2h
 *   8–16w:  2.5h
 *   16–52w: 3h   — Stage 2 infants; one feed every 4h but diaper check is still 3h
 *   52w+:   3.5h — toddlers; less frequent changes needed
 */
export function getDiaperReminderIntervalMs(birthDate?: string | null): number {
  const weeks = getAgeWeeks(birthDate ?? undefined);
  if (weeks < 4) return 1.5 * 60 * 60_000;
  if (weeks < 8) return 2 * 60 * 60_000;
  if (weeks < 16) return 2.5 * 60 * 60_000;
  if (weeks < 52) return 3 * 60 * 60_000;
  return 3.5 * 60 * 60_000;
}

/**
 * Age-adaptive interval for feed reminders.
 * Delegates to the same feed-interval table used by the baby card schedule,
 * so reminder timing is always consistent with what the card predicts.
 */
export function getFeedReminderIntervalMs(birthDate?: string | null): number {
  return getScheduleForAge(getAgeWeeks(birthDate ?? undefined)).feedMs;
}

/**
 * Human-readable "about Xh" label for a reminder interval (used in notification body).
 * e.g. 5400000 → "1.5 hours", 7200000 → "2 hours", 10800000 → "3 hours"
 */
export function formatReminderInterval(ms: number): string {
  const h = ms / (60 * 60_000);
  return h % 1 === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h} hours`;
}

/**
 * How many minutes to wait before responding to overnight/nap crying.
 * Timer resets if crying stops — only count uninterrupted crying.
 * After wait: respond only with food (ghost feed), no rocking or comfort.
 * Source: TwinTrackerSleepTrainingModuleResea.md Tip #6
 * Note: Sleep Training mode will surface this prominently; here it's passive data.
 */
export function getSelfSoothingMinutes(ageWeeks: number): number {
  if (ageWeeks < 4) return 5; // 0–4w: 5–10 min (lower end)
  if (ageWeeks < 12) return 10; // 4–12w: 10–15 min
  if (ageWeeks < 24) return 20; // 3–6m: 20 min
  if (ageWeeks < 36) return 30; // 6–9m: 30–45 min (lower end)
  return 45; // 9m+: 45–60 min (lower end)
}

/**
 * Age-appropriate schedule parameters aligned with sleep training research.
 * Stage 1 (0–15w): 3-hour Feed→Play→Sleep cycle per research.
 *   feedMs = 3h throughout (research: 3-hour cycle means feed every 3h).
 * Stage 2 (16w–18m): 4-hour schedule; inter-nap awake window = 2h; nap target = 2h.
 *   Note: the final awake stretch before 7pm bedtime is 4h — sleep training mode
 *   will handle bedtime logic; this awakeMs drives inter-nap predictions.
 * Stage 3 (18m+): one afternoon nap; ~5h awake before nap; nap target = 2.5h.
 * LearnedStats always override these defaults once enough data is collected.
 */
export function getScheduleForAge(ageWeeks: number): {
  napMs: number;
  awakeMs: number;
  feedMs: number;
} {
  // Stage 1 (0–15w): 3-hour Feed→Play→Sleep cycle
  if (ageWeeks < 4) {
    // 0–4w: very short wake window; 3h feed cycle
    return { napMs: 90 * 60_000, awakeMs: 60 * 60_000, feedMs: 3 * 3600_000 };
  }
  if (ageWeeks < 8) {
    // 4–8w: wake window growing to ~90m; 3h feed cycle
    return { napMs: 90 * 60_000, awakeMs: 90 * 60_000, feedMs: 3 * 3600_000 };
  }
  if (ageWeeks < 16) {
    // 8–15w: wake window ~90–120m; 3h feed cycle
    return { napMs: 90 * 60_000, awakeMs: 120 * 60_000, feedMs: 3 * 3600_000 };
  }

  // Stage 2 (16w–18m): 4-hour schedule; two 2-hour crib naps; 7pm bedtime
  if (ageWeeks < 78) {
    return { napMs: 120 * 60_000, awakeMs: 120 * 60_000, feedMs: 4 * 3600_000 };
  }

  // Stage 3 (18m+): one 2–3h afternoon nap starting ~noon; ~5h awake before nap
  return { napMs: 150 * 60_000, awakeMs: 300 * 60_000, feedMs: 5 * 3600_000 };
}

/**
 * Age-appropriate total daily sleep target range (naps + night, in ms).
 * Sources: AAP/CDC guidelines, Nanit North American averages.
 *
 * | Age          | Total sleep/day |
 * |--------------|-----------------|
 * | 0–13 weeks   | 14–18h          |
 * | 14–26 weeks  | 14–16h          |
 * | 27–52 weeks  | 12–15h          |
 * | 53–78 weeks  | 11–14h          |
 * | 78+ weeks    | 11–14h          |
 */
export function getTargetDailySleepMs(ageWeeks: number): { minMs: number; maxMs: number } {
  const h = (n: number) => n * 60 * 60_000;
  if (ageWeeks < 14) {
    return { minMs: h(14), maxMs: h(18) };
  }
  if (ageWeeks < 27) {
    return { minMs: h(14), maxMs: h(16) };
  }
  if (ageWeeks < 53) {
    return { minMs: h(12), maxMs: h(15) };
  }
  return { minMs: h(11), maxMs: h(14) };
}

/**
 * Returns true if the given fire timestamp would land inside the night window
 * (bedtimeHour ≤ hour < midnight, or midnight ≤ hour < wakeHour).
 * Used to suppress bottle/diaper reminder notifications during sleep time.
 */
export function isNightFireTime(fireMs: number, bedtimeHour: number, wakeHour: number): boolean {
  const h = new Date(fireMs).getHours();
  return h >= bedtimeHour || h < wakeHour;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function urgency(targetMs: number): Urgency {
  if (targetMs <= 0) {
    return 'overdue';
  }
  if (targetMs <= SOON_THRESHOLD_MS) {
    return 'soon';
  }
  return 'ok';
}

function formatDetail(ms: number, prefix: string): string {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60_000);
  if (mins < 60) {
    return `${prefix} ${mins}m`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${prefix} ${h}h` : `${prefix} ${h}h ${m}m`;
}

/** Compact format: "1h 5m", "30m" */
export function formatMs(ms: number): string {
  const totalMins = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

/** Prose format: "1 hour and 5 minutes", "30 minutes" */
function formatMsProse(ms: number): string {
  const totalMins = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) {
    return m === 1 ? '1 minute' : `${m} minutes`;
  }
  const hStr = h === 1 ? '1 hour' : `${h} hours`;
  if (m === 0) {
    return hStr;
  }
  const mStr = m === 1 ? '1 minute' : `${m} minutes`;
  return `${hStr} and ${mStr}`;
}

export function formatTime12(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)} ${ampm}`;
}

// ---------------------------------------------------------------------------
// getNextAction
// ---------------------------------------------------------------------------

export function getNextAction(
  latest: LatestEventMap,
  babyId: string,
  now: Date = new Date(),
  birthDate?: string,
): NextAction {
  const nowMs = now.getTime();
  const schedule = getScheduleForAge(getAgeWeeks(birthDate));

  const napKey = `${babyId}:nap`;
  const napEvent = latest[napKey];

  // 1. Active nap (no endedAt) → show Wake action
  if (napEvent && !napEvent.endedAt) {
    const napStartMs = new Date(napEvent.startedAt).getTime();
    const elapsedMs = nowMs - napStartMs;
    const remainingMs = schedule.napMs - elapsedMs;
    return {
      action: 'Wake',
      detail:
        remainingMs > 0
          ? formatDetail(remainingMs, 'wake in')
          : formatDetail(-remainingMs, 'overdue by'),
      targetMs: remainingMs,
      totalMs: schedule.napMs,
      urgency: urgency(remainingMs),
    };
  }

  // 2. Check awake duration since last nap ended
  if (napEvent?.endedAt) {
    const wakeMs = new Date(napEvent.endedAt).getTime();
    const awakeElapsedMs = nowMs - wakeMs;
    const remainingMs = schedule.awakeMs - awakeElapsedMs;
    if (remainingMs <= SOON_THRESHOLD_MS) {
      return {
        action: 'Nap time',
        detail:
          remainingMs > 0
            ? formatDetail(remainingMs, 'in')
            : formatDetail(-remainingMs, 'overdue by'),
        targetMs: remainingMs,
        totalMs: schedule.awakeMs,
        urgency: urgency(remainingMs),
      };
    }
  }

  // 3. Default: Bottle — next feed after last bottle/nursing
  const bottleKey = `${babyId}:bottle`;
  const nursingKey = `${babyId}:nursing`;
  const bottleEvent = latest[bottleKey];
  const nursingEvent = latest[nursingKey];

  let lastFeedMs = 0;
  if (bottleEvent && nursingEvent) {
    lastFeedMs = Math.max(
      new Date(bottleEvent.startedAt).getTime(),
      new Date(nursingEvent.startedAt).getTime(),
    );
  } else if (bottleEvent) {
    lastFeedMs = new Date(bottleEvent.startedAt).getTime();
  } else if (nursingEvent) {
    lastFeedMs = new Date(nursingEvent.startedAt).getTime();
  }

  // No feed data: treat as due in feedMs (unknown baseline, not overdue)
  const nextFeedMs = lastFeedMs > 0 ? lastFeedMs + schedule.feedMs : nowMs + schedule.feedMs;
  const remainingMs = nextFeedMs - nowMs;

  return {
    action: 'Bottle',
    detail: remainingMs > 0 ? formatDetail(remainingMs, 'due in') : 'due now',
    targetMs: remainingMs,
    totalMs: schedule.feedMs,
    urgency: urgency(remainingMs),
  };
}

// ---------------------------------------------------------------------------
// BabyInsight — human-readable narrative for the home card
// ---------------------------------------------------------------------------

/** Compact "X ago" string: "45m ago", "1h 5m ago" */
function formatAgo(elapsedMs: number): string {
  return `${formatMs(elapsedMs)} ago`;
}

export interface BabyInsight {
  headline: string;
  narrative: string;
  alarmMs: number | null;
  /** "45m ago" / "1h 30m ago" / null if no feed logged */
  fedAgo: string | null;
  /** "45m ago" / null if no diaper logged */
  changedAgo: string | null;
  /** "Active · 1h 5m" / "1h 30m ago" / null if no nap data */
  sleepStatus: string | null;
  totalOzToday: number;
  urgency: Urgency;
  /** Forward-looking predictions, sorted soonest/most-overdue first */
  predictions: PredictedAction[];
  /** Suggested oz per bottle: learned median if available, else age-based default */
  suggestedOz: number;
  /**
   * Sleep training stage from research: 1 = 0–15w (3h cycle), 2 = 16w–18m (4h, two 2h naps),
   * 3 = 18m+ (one afternoon nap). Used by Sleep Training mode for contextual guidance.
   */
  scheduleStage: 1 | 2 | 3;
  /**
   * Minutes to wait before responding to crying overnight/during nap (uninterrupted).
   * Source: sleep training research Tip #6. Surfaced actively in Sleep Training mode.
   */
  selfSoothingMinutes: number;
  /**
   * True when current time is outside [wakeHour, bedtimeHour).
   * Drives the Nap→Sleep button switch in BabyCard and theme night mode.
   */
  isNight: boolean;
  /**
   * True when the baby is in the pre-bedtime awake stretch (woke within 4.5h of bedtime
   * and bedtime hasn't arrived yet). Drives the Nap→Sleep button switch before isNight
   * kicks in so the button already reads "Sleep" in the lead-up to bedtime.
   */
  isBedtimeStretch: boolean;
}

/**
 * Compute forward-looking predictions for bottle and diaper.
 * Pass `lastFeedMs=0` if no feed data — bottle prediction will be omitted.
 */
function computePredictions(
  babyId: string,
  latest: LatestEventMap,
  lastFeedMs: number,
  schedule: { feedMs: number; awakeMs: number },
  now: Date,
): PredictedAction[] {
  const nowMs = now.getTime();
  const results: PredictedAction[] = [];

  // Bottle
  if (lastFeedMs > 0) {
    const remainingMs = lastFeedMs + schedule.feedMs - nowMs;
    results.push({
      type: 'bottle',
      label: remainingMs > 0 ? `Bottle in ${formatMs(remainingMs)}` : 'Bottle due',
      remainingMs,
      intervalMs: schedule.feedMs,
      urgency: urgency(remainingMs),
    });
  }

  // Diaper
  const diaperEvent = latest[`${babyId}:diaper`];
  if (diaperEvent) {
    const remainingMs = new Date(diaperEvent.startedAt).getTime() + DIAPER_INTERVAL_MS - nowMs;
    results.push({
      type: 'diaper',
      label: remainingMs > 0 ? `Change in ${formatMs(remainingMs)}` : 'Change due',
      remainingMs,
      intervalMs: DIAPER_INTERVAL_MS,
      urgency: urgency(remainingMs),
    });
  }

  // Most overdue / soonest first
  return results.sort((a, b) => a.remainingMs - b.remainingMs);
}

export function getBabyInsight(
  baby: Baby,
  latest: LatestEventMap,
  events: TrackerEvent[],
  now: Date,
  resetHour = 0,
  learnedStats?: LearnedStats,
  bedtimeHour = 19,
  wakeHour = 7,
  sleepTraining = false,
): BabyInsight {
  const nowMs = now.getTime();
  const nowHour = now.getHours();
  const isNight = nowHour >= bedtimeHour || nowHour < wakeHour;

  const ageWeeks = getAgeWeeks(baby.birthDate);
  const ageSchedule = getScheduleForAge(ageWeeks);
  const schedule = {
    napMs: learnedStats?.avgNapDurationMs ?? ageSchedule.napMs,
    awakeMs: learnedStats?.avgAwakeWindowMs ?? ageSchedule.awakeMs,
    feedMs: learnedStats?.avgFeedIntervalMs ?? ageSchedule.feedMs,
  };
  const suggestedOz =
    learnedStats?.avgBottleOz != null
      ? Math.round(learnedStats.avgBottleOz)
      : getDefaultOzForAge(ageWeeks);
  const scheduleStage = getScheduleStage(ageWeeks);
  const selfSoothingMinutes = getSelfSoothingMinutes(ageWeeks);

  // Total oz today (bottle events for this baby since the daily reset boundary)
  const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour, 0, 0, 0);
  if (reset.getTime() > nowMs) {
    reset.setDate(reset.getDate() - 1);
  }
  const resetMs = reset.getTime();
  const totalOzToday = events
    .filter(
      e =>
        e.babyId === baby.id && e.type === 'bottle' && new Date(e.startedAt).getTime() >= resetMs,
    )
    .reduce((sum, e) => sum + (e.value ?? 0), 0);

  // Last feed
  const bottleEvent = latest[`${baby.id}:bottle`];
  const nursingEvent = latest[`${baby.id}:nursing`];
  let lastFeedMs = 0;

  if (bottleEvent && nursingEvent) {
    lastFeedMs = Math.max(
      new Date(bottleEvent.startedAt).getTime(),
      new Date(nursingEvent.startedAt).getTime(),
    );
  } else if (bottleEvent) {
    lastFeedMs = new Date(bottleEvent.startedAt).getTime();
  } else if (nursingEvent) {
    lastFeedMs = new Date(nursingEvent.startedAt).getTime();
  }

  const fedAgo = lastFeedMs > 0 ? formatAgo(nowMs - lastFeedMs) : null;

  // Last changed (diaper)
  const diaperEvent = latest[`${baby.id}:diaper`];
  const changedAgo = diaperEvent
    ? formatAgo(nowMs - new Date(diaperEvent.startedAt).getTime())
    : null;

  // Resolve active sleep event: prefer the most recently started of nap vs sleep
  const napEvent = latest[`${baby.id}:nap`];
  const sleepEvent = latest[`${baby.id}:sleep`];

  const napStartMs = napEvent && !napEvent.endedAt ? new Date(napEvent.startedAt).getTime() : 0;
  const sleepStartMs =
    sleepEvent && !sleepEvent.endedAt ? new Date(sleepEvent.startedAt).getTime() : 0;

  let activeEvent: TrackerEvent | undefined;
  let activeEventIsNight = false;
  if (napStartMs > 0 && sleepStartMs > 0) {
    if (napStartMs >= sleepStartMs) {
      activeEvent = napEvent!;
    } else {
      activeEvent = sleepEvent!;
      activeEventIsNight = true;
    }
  } else if (sleepStartMs > 0) {
    activeEvent = sleepEvent!;
    activeEventIsNight = true;
  } else if (napStartMs > 0) {
    activeEvent = napEvent!;
  }

  // Most recent ended wake time (nap or night sleep), for awake-since calculations
  const endedNapMs = napEvent?.endedAt ? new Date(napEvent.endedAt).getTime() : 0;
  const endedSleepMs = sleepEvent?.endedAt ? new Date(sleepEvent.endedAt).getTime() : 0;
  const lastWokeMs = Math.max(endedNapMs, endedSleepMs);

  // Sleep status for profile stats
  let sleepStatus: string | null = null;
  if (activeEvent) {
    sleepStatus = `Active · ${formatMs(nowMs - new Date(activeEvent.startedAt).getTime())}`;
  } else if (lastWokeMs > 0) {
    sleepStatus = formatAgo(nowMs - lastWokeMs);
  }

  // Pre-bedtime stretch: baby woke within 4.5h of tonight's bedtime and bedtime hasn't arrived.
  // Drives the Nap→Sleep button switch and bedtime-countdown narrative.
  const todayBedtime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    bedtimeHour,
    0,
    0,
    0,
  );
  const bedtimeRemainingMs = todayBedtime.getTime() - nowMs;
  const isBedtimeStretch =
    lastWokeMs > 0 &&
    todayBedtime.getTime() - lastWokeMs <= 4.5 * 60 * 60_000 &&
    bedtimeRemainingMs > 0;

  // Forward-looking predictions
  const predictions = computePredictions(baby.id, latest, lastFeedMs, schedule, now);

  // Shared profile stats spread into every return
  const stats = {
    fedAgo,
    changedAgo,
    sleepStatus,
    totalOzToday,
    predictions,
    suggestedOz,
    scheduleStage,
    selfSoothingMinutes,
    isNight,
    isBedtimeStretch,
  };

  // Sleep training hint appended to narratives when active event is in progress.
  // Source: research Tip #6 — timer resets if crying stops; respond only with food after wait.
  const stHint = sleepTraining && activeEvent ? ` If crying, wait ${selfSoothingMinutes}m.` : '';

  // ── Active nap or night sleep ──────────────────────────────────────────────
  if (activeEvent) {
    const eventStartMs = new Date(activeEvent.startedAt).getTime();
    const elapsedMs = nowMs - eventStartMs;
    const elapsedStr = formatMs(elapsedMs);
    const elapsedProse = formatMsProse(elapsedMs);

    if (activeEventIsNight) {
      // Night sleep: no alarm (let them sleep); show elapsed time
      return {
        headline: `Sleeping · ${elapsedStr}`,
        narrative: `${baby.name} is sleeping for the night.${stHint}`,
        alarmMs: null,
        urgency: 'ok',
        ...stats,
      };
    }

    // Daytime nap
    const remainingMs = schedule.napMs - elapsedMs;
    if (remainingMs > 0) {
      const wakeTime = new Date(eventStartMs + schedule.napMs);
      const wakeTimeStr = formatTime12(wakeTime);
      const remainingStr = formatMsProse(remainingMs);
      return {
        headline: `Sleeping · ${elapsedStr}`,
        narrative: `${baby.name} has been asleep for ${elapsedProse}. Likely awake around ${wakeTimeStr}, in about ${remainingStr}.${stHint}`,
        alarmMs: remainingMs,
        urgency: remainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    } else {
      return {
        headline: `Sleeping · ${elapsedStr}`,
        narrative: `${baby.name} has been asleep for ${elapsedProse}, a bit longer than usual. Could be awake any minute.${stHint}`,
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    }
  }

  // ── Awake since last nap/sleep ended ──────────────────────────────────────
  if (lastWokeMs > 0) {
    const awakeElapsedMs = nowMs - lastWokeMs;
    const elapsedStr = formatMs(awakeElapsedMs);

    if (isBedtimeStretch) {
      const bedtimeStr = formatTime12(todayBedtime);
      const remainingStr = formatMsProse(bedtimeRemainingMs);
      return {
        headline: `Awake · ${elapsedStr}`,
        narrative: `Bedtime in about ${remainingStr} · ${bedtimeStr}.`,
        alarmMs: null,
        urgency: bedtimeRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    }

    const remainingMs = schedule.awakeMs - awakeElapsedMs;

    if (remainingMs <= 0) {
      return {
        headline: `Awake · ${elapsedStr}`,
        narrative: `It's time for a nap.`,
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    } else if (remainingMs <= 30 * 60_000) {
      const napTime = new Date(lastWokeMs + schedule.awakeMs);
      const napTimeStr = formatTime12(napTime);
      const remainingStr = formatMsProse(remainingMs);
      return {
        headline: `Awake · ${elapsedStr}`,
        narrative:
          remainingMs <= SOON_THRESHOLD_MS
            ? `Nap time · ${napTimeStr}.`
            : `Nap in about ${remainingStr} · ${napTimeStr}.`,
        alarmMs: null,
        urgency: remainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    } else {
      const remainingStr = formatMsProse(remainingMs);
      const napTime = new Date(lastWokeMs + schedule.awakeMs);
      const napTimeStr = formatTime12(napTime);
      return {
        headline: `Awake · ${elapsedStr}`,
        narrative: `Next nap likely in about ${remainingStr} · ${napTimeStr}.`,
        alarmMs: null,
        urgency: 'ok',
        ...stats,
      };
    }
  }

  // ── Feed overdue (no nap data) ────────────────────────────────────────────
  if (lastFeedMs > 0) {
    const feedAgoMs = nowMs - lastFeedMs;
    const feedRemainingMs = schedule.feedMs - feedAgoMs;
    if (feedRemainingMs <= 0) {
      const timeStr = formatTime12(new Date(lastFeedMs));
      const agoStr = formatMsProse(feedAgoMs);
      return {
        headline: 'Awake · hungry',
        narrative: `${baby.name} is due for a feed. Last fed at ${timeStr} (${agoStr} ago).`,
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    }
  }

  // ── No data ───────────────────────────────────────────────────────────────
  return {
    headline: isNight ? 'Good night' : 'Good morning',
    narrative: `No events yet for ${baby.name} today. Log the first feed or nap to get started.`,
    alarmMs: null,
    urgency: 'ok',
    ...stats,
  };
}
