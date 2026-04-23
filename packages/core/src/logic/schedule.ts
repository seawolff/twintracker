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
import { AAP_MAX_DAILY_OZ, STAGE1_BEDTIME_HOUR } from '../config';
import i18n from '../i18n/index';

const SOON_THRESHOLD_MS = 5 * 60 * 1000;
/**
 * How far before bedtime the last feed should start.
 * 30 min allows ~15 min to feed + burp and ~15 min to change + settle before sleep.
 * Applies for Stage 2+ only (Stage 1 has no fixed bedtime).
 */
const PRE_BEDTIME_FEED_BUFFER_MS = 30 * 60_000;
/**
 * How far before bedtime the diaper change should happen.
 * Targeted after the pre-bedtime feed (15 min before bedtime).
 */
const PRE_BEDTIME_DIAPER_BUFFER_MS = 15 * 60_000;
/**
 * AAP guidance: wake babies under 4 weeks if they have been sleeping > 4–5h without a feed.
 * Weight gain is the priority in the first month — they should not be allowed to sleep through feeds.
 */
const NEWBORN_MAX_SLEEP_MS = 4 * 60 * 60_000;
/** Age threshold for the overnight feed wake alert — applies only in the first 4 weeks. */
const NEWBORN_WAKE_ALERT_WEEKS = 4;

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

/** Returns baby's age in whole days, or null if birthDate is missing. */
export function getAgeDays(birthDate?: string | null): number | null {
  if (!birthDate) {
    return null;
  }
  const ms = Date.now() - new Date(birthDate).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Milliseconds in one day — used for feeds-per-day calculations. */
const MS_PER_DAY = 24 * 60 * 60_000;

/**
 * Age-appropriate default formula oz per feed.
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
 */
export function getScheduleStage(ageWeeks: number): 1 | 2 | 3 {
  if (ageWeeks < 16) {
    return 1;
  }
  if (ageWeeks < 78) {
    return 2;
  } // 78w ≈ 18 months
  return 3;
}

/**
 * Age-adaptive interval for diaper-change reminders.
 *
 * Cross-referenced against broad pediatric guidance rather than a strict medical schedule:
 * - NHS: early days are roughly 10–12 diaper changes/day; older babies are around 6–8/day.
 * - HealthyChildren (AAP): parents may see 8–12/day early on and average roughly 6/day across the first year.
 *
 * This reminder is intentionally conservative and stage-oriented:
 * - Stage 1 newborns still get fairly frequent prompts.
 * - Stage 2 older infants shift later so reminders stop feeling prematurely "due."
 * - Stage 3 toddlers move later again.
 *
 * The app still expects parents to change promptly after poop / obvious wetness; this is only
 * a predictive reminder interval for the home card and notifications.
 */
export function getDiaperIntervalMs(ageWeeks: number): number {
  if (ageWeeks < 16) {
    return 150 * 60_000;
  } // Stage 1: 2.5h ~= 9.6 changes/day
  if (ageWeeks < 78) {
    return 210 * 60_000;
  } // Stage 2: 3.5h ~= 6.9 changes/day
  return 240 * 60_000; // Stage 3: 4h ~= 6 changes/day
}

/**
 * How many minutes to wait before responding to overnight/nap crying.
 * Timer resets if crying stops — only count uninterrupted crying.
 * After wait: respond only with food (ghost feed), no rocking or comfort.
 * Note: Sleep Training mode will surface this prominently; here it's passive data.
 */
export function getSelfSoothingMinutes(ageWeeks: number): number {
  if (ageWeeks < 4) {
    return 5;
  } // 0–4w: 5–10 min (lower end)
  if (ageWeeks < 12) {
    return 10;
  } // 4–12w: 10–15 min
  if (ageWeeks < 24) {
    return 20;
  } // 3–6m: 20 min
  if (ageWeeks < 36) {
    return 30;
  } // 6–9m: 30–45 min (lower end)
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
  /** Which feed mode should represent the feed triage cell right now. */
  feedTriageMode: 'bottle' | 'nursing';
  /** "45m ago" / null if no diaper logged */
  changedAgo: string | null;
  /** "Active · 1h 5m" / "1h 30m ago" / null if no nap data */
  sleepStatus: string | null;
  totalOzToday: number;
  /** Total nursing minutes logged since calendar midnight. */
  totalNursingMinutesToday: number;
  /** Number of bottle events logged since calendar midnight. */
  bottleCountToday: number;
  /** Number of nursing events logged since calendar midnight. */
  nursingCountToday: number;
  /**
   * Age-based daily oz target: (feeds per day × suggestedOz), capped at AAP_MAX_DAILY_OZ.
   * Uses learned feed interval when available. Only meaningful for bottle-fed babies.
   */
  targetOzToday: number;
  /** Number of bottle + nursing events logged since the daily reset boundary. */
  feedCountToday: number;
  /**
   * How many feeds fit in 24h at the current schedule interval.
   * Stage 1 (3h) = 8, Stage 2 (4h) = 6, Stage 3 (5h) = 5.
   */
  targetFeedsPerDay: number;
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
 * Compute forward-looking predictions for nap/bedtime, bottle, and diaper.
 * Pass `lastFeedMs=0` if no feed data — bottle prediction will be omitted.
 *
 * When `bedtimeMs` is provided (bedtime stretch), predictions are snapped earlier
 * so that the feed and diaper change happen *before* sleep rather than after:
 *   - Feed deadline → bedtimeMs - PRE_BEDTIME_FEED_BUFFER_MS
 *   - Diaper deadline → bedtimeMs - PRE_BEDTIME_DIAPER_BUFFER_MS
 * Only snapped when the normal timing would fall past the respective deadline.
 * `bedtimeMs` is always the effective bedtime (accounts for Stage 1 = 22:00 override).
 */
function computePredictions(
  babyId: string,
  latest: LatestEventMap,
  lastFeedMs: number,
  schedule: { feedMs: number; awakeMs: number },
  diaperIntervalMs: number,
  now: Date,
  primaryAwakePrediction: { type: 'nap' | 'sleep'; targetMs: number } | null,
  bedtimeMs?: number,
): PredictedAction[] {
  const nowMs = now.getTime();
  const results: PredictedAction[] = [];

  if (primaryAwakePrediction) {
    const remainingMs = primaryAwakePrediction.targetMs - nowMs;
    results.push({
      type: primaryAwakePrediction.type,
      label:
        primaryAwakePrediction.type === 'sleep'
          ? remainingMs > 0
            ? i18n.t('schedule.pred_sleep_in', { time: formatMs(remainingMs) })
            : i18n.t('schedule.pred_sleep_due')
          : remainingMs > 0
            ? i18n.t('schedule.pred_nap_in', { time: formatMs(remainingMs) })
            : i18n.t('schedule.pred_nap_due'),
      remainingMs,
      intervalMs: schedule.awakeMs,
      urgency: urgency(remainingMs),
    });
  }

  // Bottle — snap to pre-bedtime deadline when the normal next feed overshoots bedtime
  if (lastFeedMs > 0) {
    const normalNextFeedMs = lastFeedMs + schedule.feedMs;
    const feedDeadlineMs =
      bedtimeMs != null && normalNextFeedMs > bedtimeMs
        ? bedtimeMs - PRE_BEDTIME_FEED_BUFFER_MS
        : normalNextFeedMs;
    const remainingMs = feedDeadlineMs - nowMs;
    results.push({
      type: 'bottle',
      label:
        remainingMs > 0
          ? i18n.t('schedule.pred_bottle_in', { time: formatMs(remainingMs) })
          : i18n.t('schedule.pred_bottle_due'),
      remainingMs,
      intervalMs: schedule.feedMs,
      urgency: urgency(remainingMs),
    });
  }

  // Diaper — snap to pre-bedtime deadline when the normal next change overshoots bedtime
  const diaperEvent = latest[`${babyId}:diaper`];
  if (diaperEvent) {
    const normalNextDiaperMs = new Date(diaperEvent.startedAt).getTime() + diaperIntervalMs;
    const diaperDeadlineMs =
      bedtimeMs != null && normalNextDiaperMs > bedtimeMs - PRE_BEDTIME_DIAPER_BUFFER_MS
        ? bedtimeMs - PRE_BEDTIME_DIAPER_BUFFER_MS
        : normalNextDiaperMs;
    const remainingMs = diaperDeadlineMs - nowMs;
    results.push({
      type: 'diaper',
      label:
        remainingMs > 0
          ? i18n.t('schedule.pred_change_in', { time: formatMs(remainingMs) })
          : i18n.t('schedule.pred_change_due'),
      remainingMs,
      intervalMs: diaperIntervalMs,
      urgency: urgency(remainingMs),
    });
  }

  const predictionPriority = (type: PredictedAction['type']): number => {
    switch (type) {
      case 'sleep':
      case 'nap':
        return 0;
      case 'bottle':
        return 1;
      case 'diaper':
        return 2;
      default:
        return 99;
    }
  };

  return results.sort((a, b) => {
    const priorityDelta = predictionPriority(a.type) - predictionPriority(b.type);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.remainingMs - b.remainingMs;
  });
}

export function getBabyInsight(
  baby: Baby,
  latest: LatestEventMap,
  events: TrackerEvent[],
  now: Date,
  _resetHour = 0,
  learnedStats?: LearnedStats,
  bedtimeHour = 19,
  wakeHour = 7,
): BabyInsight {
  const nowMs = now.getTime();
  const nowHour = now.getHours();

  const ageWeeks = getAgeWeeks(baby.birthDate);
  const ageSchedule = getScheduleForAge(ageWeeks);
  const schedule = {
    napMs: learnedStats?.avgNapDurationMs ?? ageSchedule.napMs,
    awakeMs: learnedStats?.avgAwakeWindowMs ?? ageSchedule.awakeMs,
    feedMs: learnedStats?.avgFeedIntervalMs || ageSchedule.feedMs,
  };
  const suggestedOz =
    learnedStats?.avgBottleOz != null
      ? Math.round(learnedStats.avgBottleOz)
      : getDefaultOzForAge(ageWeeks);
  const scheduleStage = getScheduleStage(ageWeeks);
  const selfSoothingMinutes = getSelfSoothingMinutes(ageWeeks);
  const diaperIntervalMs = getDiaperIntervalMs(ageWeeks);

  /** Stage 1 newborns have a 10pm circadian anchor — use that instead of user's bedtime preference. */
  const effectiveBedtimeHour = scheduleStage === 1 ? STAGE1_BEDTIME_HOUR : bedtimeHour;

  // Total oz and feed count always reset at calendar midnight — independent of wakeHour.
  // wakeHour only affects the day/night theme and schedule logic, not daily intake totals.
  const midnightMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const totalOzToday = events
    .filter(
      e =>
        e.babyId === baby.id &&
        e.type === 'bottle' &&
        new Date(e.startedAt).getTime() >= midnightMs,
    )
    // Coerce to Number — pg returns NUMERIC columns as strings at runtime despite the TS type.
    .reduce((sum, e) => sum + Number(e.value ?? 0), 0);
  const totalNursingMinutesToday = events
    .filter(
      e =>
        e.babyId === baby.id &&
        e.type === 'nursing' &&
        new Date(e.startedAt).getTime() >= midnightMs,
    )
    .reduce((sum, e) => sum + Number(e.value ?? 0), 0);
  const bottleCountToday = events.filter(
    e =>
      e.babyId === baby.id &&
      e.type === 'bottle' &&
      new Date(e.startedAt).getTime() >= midnightMs,
  ).length;
  const nursingCountToday = events.filter(
    e =>
      e.babyId === baby.id &&
      e.type === 'nursing' &&
      new Date(e.startedAt).getTime() >= midnightMs,
  ).length;

  // Total feeds today (bottle + nursing) for this baby since calendar midnight
  const feedCountToday = bottleCountToday + nursingCountToday;

  // Target feeds per day: how many feed intervals fit in 24h at the current schedule
  const targetFeedsPerDay = Math.round(MS_PER_DAY / schedule.feedMs);

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

  const lastBottleMs = bottleEvent ? new Date(bottleEvent.startedAt).getTime() : 0;
  const lastNursingMs = nursingEvent ? new Date(nursingEvent.startedAt).getTime() : 0;
  const lastFeedType: 'bottle' | 'nursing' =
    lastNursingMs > lastBottleMs ? 'nursing' : 'bottle';
  const feedTriageMode: 'bottle' | 'nursing' =
    bottleCountToday > nursingCountToday
      ? 'bottle'
      : nursingCountToday > bottleCountToday
        ? 'nursing'
        : feedCountToday > 0
          ? lastFeedType
          : lastFeedType;

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
  const bedtimeBoundaryMs = getMostRecentBedtimeBoundaryMs(now, effectiveBedtimeHour);
  const hasWokenForDay = endedSleepMs > 0 && endedSleepMs >= bedtimeBoundaryMs;
  const isNight = !hasWokenForDay && (nowHour >= effectiveBedtimeHour || nowHour < wakeHour);

  // Sleep status for profile stats
  let sleepStatus: string | null = null;
  if (activeEvent) {
    sleepStatus = `Active · ${formatMs(nowMs - new Date(activeEvent.startedAt).getTime())}`;
  } else if (lastWokeMs > 0) {
    sleepStatus = formatAgo(nowMs - lastWokeMs);
  }

  // Pre-bedtime stretch: baby woke within 4.5h of tonight's bedtime and bedtime hasn't arrived.
  // Drives the Nap→Sleep button switch and bedtime-countdown narrative.
  // Stage 1 newborns have no circadian rhythm yet — suppress the bedtime stretch entirely.
  const todayBedtime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    effectiveBedtimeHour,
    0,
    0,
    0,
  );
  const bedtimeRemainingMs = todayBedtime.getTime() - nowMs;
  const isBedtimeStretch =
    scheduleStage !== 1 &&
    lastWokeMs > 0 &&
    todayBedtime.getTime() - lastWokeMs <= 4.5 * 60 * 60_000 &&
    bedtimeRemainingMs > 0;
  const shouldPrioritizeBedtime =
    scheduleStage !== 1 &&
    lastWokeMs > 0 &&
    bedtimeRemainingMs > 0 &&
    (isBedtimeStretch || bedtimeRemainingMs < schedule.napMs);
  const primaryAwakePrediction =
    !activeEvent && lastWokeMs > 0 && !(scheduleStage !== 1 && isNight)
      ? {
          type: shouldPrioritizeBedtime ? ('sleep' as const) : ('nap' as const),
          targetMs: shouldPrioritizeBedtime ? todayBedtime.getTime() : lastWokeMs + schedule.awakeMs,
        }
      : null;

  // Forward-looking predictions
  // Pass effective bedtime so predictions snap to pre-bedtime deadlines during the stretch.
  const predictions = computePredictions(
    baby.id,
    latest,
    lastFeedMs,
    schedule,
    diaperIntervalMs,
    now,
    primaryAwakePrediction,
    isBedtimeStretch ? todayBedtime.getTime() : undefined,
  );
  const visiblePredictions =
    scheduleStage !== 1 && isNight && !activeEvent ? [] : predictions;

  // Daily oz target: (feeds per day × oz per feed), capped at the AAP maximum.
  const targetOzToday = Math.min(
    Math.round((MS_PER_DAY / schedule.feedMs) * suggestedOz),
    AAP_MAX_DAILY_OZ,
  );

  // Shared profile stats spread into every return
  const stats = {
    fedAgo,
    feedTriageMode,
    changedAgo,
    sleepStatus,
    totalOzToday,
    totalNursingMinutesToday,
    bottleCountToday,
    nursingCountToday,
    targetOzToday,
    feedCountToday,
    targetFeedsPerDay,
    predictions: visiblePredictions,
    suggestedOz,
    scheduleStage,
    selfSoothingMinutes,
    isNight,
    isBedtimeStretch,
  };

  // ── Active nap or night sleep ──────────────────────────────────────────────
  if (activeEvent) {
    const eventStartMs = new Date(activeEvent.startedAt).getTime();
    const elapsedMs = nowMs - eventStartMs;
    const elapsedStr = formatMs(elapsedMs);

    // AAP: wake babies < 4 weeks if sleeping > 4h without a feed — weight gain is priority.
    if (ageWeeks < NEWBORN_WAKE_ALERT_WEEKS && elapsedMs >= NEWBORN_MAX_SLEEP_MS) {
      return {
        headline: i18n.t('schedule.sleeping_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.newborn_wake_narrative', { name: baby.name }),
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    }

    if (activeEventIsNight && scheduleStage !== 1) {
      // Night sleep (Stage 2+): no alarm (let them sleep); show elapsed time
      return {
        headline: i18n.t('schedule.sleeping_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.sleeping_night', { name: baby.name }),
        alarmMs: null,
        urgency: 'ok',
        ...stats,
      };
    }
    // Stage 1: no circadian rhythm — all sleeps use the same countdown narrative below

    // Daytime nap
    const remainingMs = schedule.napMs - elapsedMs;
    if (remainingMs > 0) {
      const wakeTime = new Date(eventStartMs + schedule.napMs);
      const wakeTimeStr = formatTime12(wakeTime);
      const remainingStr = formatMsProse(remainingMs);
      return {
        headline: i18n.t('schedule.sleeping_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.nap_wake_likely', {
          time: wakeTimeStr,
          remaining: remainingStr,
        }),
        alarmMs: remainingMs,
        urgency: remainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    } else {
      return {
        headline: i18n.t('schedule.sleeping_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.nap_overdue'),
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

    // Stage 2 early (16–26 weeks): suggest the 5–6 PM catnap.
    // Babies this age need a short contact nap (swing/stroller/arms) to bridge
    // the 2h awake window to 7 PM bedtime without becoming overtired.
    // Suggestion activates when baby is within 15 min of — or past — the awake window.
    // After 26 weeks the pattern consolidates to 2 full crib naps and this bridge nap drops.
    const isCatnapAge = scheduleStage === 2 && ageWeeks < 26;
    /** 5–6 PM window (hour 17) when a catnap is developmentally appropriate. */
    const CATNAP_START_HOUR = 17;
    const CATNAP_END_HOUR = 18;
    const isCatnapWindow = isCatnapAge && nowHour >= CATNAP_START_HOUR && nowHour < CATNAP_END_HOUR;
    /** Show suggestion when within 15 min of the awake window or already overdue. */
    const CATNAP_LEAD_MS = 15 * 60_000;
    const isCatnapDue = awakeElapsedMs >= schedule.awakeMs - CATNAP_LEAD_MS;

    if (isCatnapWindow && isCatnapDue) {
      const catnapRemainingMs = schedule.awakeMs - awakeElapsedMs;
      const catnapTime = new Date(lastWokeMs + schedule.awakeMs);
      const catnapTimeStr = formatTime12(catnapTime);
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative:
          catnapRemainingMs <= 0
            ? i18n.t('schedule.catnap_time')
            : catnapRemainingMs <= SOON_THRESHOLD_MS
              ? i18n.t('schedule.catnap_soon', { time: catnapTimeStr })
              : i18n.t('schedule.catnap_in', {
                  remaining: formatMsProse(catnapRemainingMs),
                  time: catnapTimeStr,
                }),
        alarmMs: null,
        urgency: catnapRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    }

    if (isBedtimeStretch) {
      const bedtimeStr = formatTime12(todayBedtime);
      const remainingStr = formatMsProse(bedtimeRemainingMs);
      const bedtimeMs = todayBedtime.getTime();

      // Pre-bedtime feed: needed when normal next feed would fall after bedtime
      const normalNextFeedMs = lastFeedMs > 0 ? lastFeedMs + schedule.feedMs : 0;
      const needsFeedBeforeBed = normalNextFeedMs > 0 && normalNextFeedMs > bedtimeMs;
      const preBedtimeFeedDeadlineMs = bedtimeMs - PRE_BEDTIME_FEED_BUFFER_MS;
      const feedBeforeBedRemainingMs = preBedtimeFeedDeadlineMs - nowMs;

      // Pre-bedtime diaper: needed when normal next change would fall past the diaper deadline
      const lastDiaperMs = diaperEvent ? new Date(diaperEvent.startedAt).getTime() : 0;
      const normalNextDiaperMs = lastDiaperMs > 0 ? lastDiaperMs + diaperIntervalMs : 0;
      const preBedtimeDiaperDeadlineMs = bedtimeMs - PRE_BEDTIME_DIAPER_BUFFER_MS;
      const needsDiaperBeforeBed =
        normalNextDiaperMs > 0 && normalNextDiaperMs > preBedtimeDiaperDeadlineMs;

      if (needsFeedBeforeBed && feedBeforeBedRemainingMs <= 0) {
        // Feed window has passed — escalate to overdue
        return {
          headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
          narrative: needsDiaperBeforeBed
            ? i18n.t('schedule.feed_diaper_before_bed', { bedtime: bedtimeStr })
            : i18n.t('schedule.feed_before_bed', { bedtime: bedtimeStr }),
          alarmMs: null,
          urgency: 'overdue',
          ...stats,
        };
      }

      if (needsFeedBeforeBed) {
        const feedByStr = formatTime12(new Date(preBedtimeFeedDeadlineMs));
        return {
          headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
          narrative: needsDiaperBeforeBed
            ? i18n.t('schedule.feed_change_by_bedtime', {
                feedBy: feedByStr,
                remaining: remainingStr,
                bedtime: bedtimeStr,
              })
            : i18n.t('schedule.feed_by_bedtime', {
                feedBy: feedByStr,
                remaining: remainingStr,
                bedtime: bedtimeStr,
              }),
          alarmMs: null,
          urgency: feedBeforeBedRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
          ...stats,
        };
      }

      // No pre-bedtime feed needed — pure bedtime countdown
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.bedtime_in', { remaining: remainingStr, time: bedtimeStr }),
        alarmMs: null,
        urgency: bedtimeRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    }

    // If there's less than one full nap's worth of time before bedtime, a nap would run
    // past bedtime — show bedtime countdown instead of nap language.
    // isBedtimeStretch handles the normal last-awake-stretch case (woke within 4.5h of
    // bedtime); this guard catches the edge case where the baby skipped or delayed a nap
    // and is still awake well past when they should have gone down.
    if (scheduleStage !== 1 && bedtimeRemainingMs > 0 && bedtimeRemainingMs < schedule.napMs) {
      const bedtimeStr = formatTime12(todayBedtime);
      const remainingStr = formatMsProse(bedtimeRemainingMs);
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.bedtime_in', { remaining: remainingStr, time: bedtimeStr }),
        alarmMs: null,
        urgency: bedtimeRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    }

    // Past bedtime and baby not asleep — all nap language suppressed.
    // isBedtimeStretch already returned above (bedtimeRemainingMs > 0);
    // once bedtime has passed, isNight=true and we should show sleep urgency, not nap prompts.
    if (scheduleStage !== 1 && isNight) {
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.past_bedtime_awake', { name: baby.name }),
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    }

    const remainingMs = schedule.awakeMs - awakeElapsedMs;

    if (remainingMs <= 0) {
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.nap_time'),
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    } else if (remainingMs <= 30 * 60_000) {
      const napTime = new Date(lastWokeMs + schedule.awakeMs);
      const napTimeStr = formatTime12(napTime);
      const remainingStr = formatMsProse(remainingMs);
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative:
          remainingMs <= SOON_THRESHOLD_MS
            ? i18n.t('schedule.nap_time_soon', { time: napTimeStr })
            : i18n.t('schedule.nap_in', { remaining: remainingStr, time: napTimeStr }),
        alarmMs: null,
        urgency: remainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    } else {
      const remainingStr = formatMsProse(remainingMs);
      const napTime = new Date(lastWokeMs + schedule.awakeMs);
      const napTimeStr = formatTime12(napTime);
      return {
        headline: i18n.t('schedule.awake_headline', { elapsed: elapsedStr }),
        narrative: i18n.t('schedule.next_nap_in', { remaining: remainingStr, time: napTimeStr }),
        alarmMs: null,
        urgency: 'ok',
        ...stats,
      };
    }
  }

  // ── Feed logged, no nap/sleep data ───────────────────────────────────────
  if (lastFeedMs > 0) {
    const feedAgoMs = nowMs - lastFeedMs;
    const feedRemainingMs = schedule.feedMs - feedAgoMs;
    if (feedRemainingMs <= 0) {
      const timeStr = formatTime12(new Date(lastFeedMs));
      const agoStr = formatMsProse(feedAgoMs);
      return {
        headline: i18n.t('schedule.awake_hungry_headline'),
        narrative: i18n.t('schedule.feed_due', { name: baby.name, time: timeStr, ago: agoStr }),
        alarmMs: null,
        urgency: 'overdue',
        ...stats,
      };
    } else {
      // Feed logged but not yet due — show next feed time instead of empty state
      const nextFeedTime = formatTime12(new Date(lastFeedMs + schedule.feedMs));
      const remainingStr = formatMsProse(feedRemainingMs);
      return {
        headline: isNight ? i18n.t('schedule.good_night') : i18n.t('schedule.good_morning'),
        narrative: i18n.t('schedule.next_bottle_in', {
          time: nextFeedTime,
          remaining: remainingStr,
        }),
        alarmMs: null,
        urgency: feedRemainingMs <= SOON_THRESHOLD_MS ? 'soon' : 'ok',
        ...stats,
      };
    }
  }

  // ── No data ───────────────────────────────────────────────────────────────
  return {
    headline: isNight ? i18n.t('schedule.good_night') : i18n.t('schedule.good_morning'),
    narrative: i18n.t('schedule.no_events', { name: baby.name }),
    alarmMs: null,
    urgency: 'ok',
    ...stats,
  };
}
