import type { Baby, LatestEventMap, PredictedAction, TrackerEvent, Urgency } from '../types';
import i18n from '../i18n';
import type { BabyInsight } from './schedule';
import { getBabyInsight } from './schedule';
import { eventLabel } from './historyHelpers';

export type LiveActivityPredictionType = 'bottle' | 'diaper' | 'nap' | 'sleep';
export type LiveActivityFeedMode = 'bottle' | 'nursing';
export type LiveActivityEventType = 'bottle' | 'nursing' | 'pump' | 'nap' | 'sleep';

export interface LiveActivityBabySnapshot {
  babyId: string;
  babyName: string;
  babyColor: Baby['color'];
  eventId: string;
  eventType: LiveActivityEventType;
  startedAt: string;
  headline: string;
  narrative: string;
  urgency: Urgency;
  lastEventLabel: string | null;
  lastEventAt: string | null;
  nextActionType: LiveActivityPredictionType | null;
  nextActionLabel: string | null;
  nextTargetAt: string | null;
  nextSummary: string | null;
  feedSummary: string;
  feedUrgency: Urgency;
  feedMode: LiveActivityFeedMode;
  sleepSummary: string;
  sleepUrgency: Urgency;
  diaperSummary: string;
  diaperUrgency: Urgency;
}

export interface LiveActivitySnapshot {
  activityId: string;
  babies: LiveActivityBabySnapshot[];
}

interface PreferencesLike {
  wakeHour: number;
  bedtimeHour: number;
}

function getMostRecentEvent(events: TrackerEvent[], babyId: string): TrackerEvent | null {
  let latest: TrackerEvent | null = null;
  let latestMs = -Infinity;
  for (const event of events) {
    if (event.babyId !== babyId) {
      continue;
    }
    const ms = new Date(event.startedAt).getTime();
    if (ms > latestMs) {
      latest = event;
      latestMs = ms;
    }
  }
  return latest;
}

function getPredictionLabel(type: LiveActivityPredictionType): string {
  switch (type) {
    case 'bottle':
      return i18n.t('log_sheet.types.bottle');
    case 'diaper':
      return i18n.t('log_sheet.types.diaper');
    case 'nap':
      return i18n.t('log_sheet.types.nap');
    case 'sleep':
      return i18n.t('settings.bedtime_title');
    default:
      return type;
  }
}

function getPredictionByType(
  predictions: PredictedAction[],
  type: LiveActivityPredictionType,
): PredictedAction | null {
  return predictions.find(prediction => prediction.type === type) ?? null;
}

function getPrimaryLiveActivityPrediction(
  predictions: PredictedAction[],
  eventType: LiveActivityEventType,
  scheduleStage: number,
  hasActiveSleep: boolean,
): PredictedAction | null {
  if (hasActiveSleep && scheduleStage >= 2) {
    return null;
  }
  const priorityOrder: LiveActivityPredictionType[] = ['sleep', 'nap', 'bottle', 'diaper'];
  if (eventType === 'nap') {
    return (
      priorityOrder
        .map(type => predictions.find(prediction => prediction.type === type))
        .find((prediction): prediction is PredictedAction => !!prediction && prediction.type !== 'diaper') ??
      predictions.find(prediction => prediction.type !== 'diaper') ??
      null
    );
  }
  return (
    priorityOrder
      .map(type => predictions.find(prediction => prediction.type === type))
      .find((prediction): prediction is PredictedAction => !!prediction) ?? null
  );
}

function buildFeedSummary(insight: BabyInsight): string {
  const hasBottle = insight.totalOzToday > 0;
  const hasNursing = insight.totalNursingMinutesToday > 0;

  if (hasBottle && hasNursing) {
    return `${insight.feedCountToday}/${insight.targetFeedsPerDay} · ${insight.totalOzToday}oz · ${insight.totalNursingMinutesToday}m`;
  }

  if (hasBottle) {
    return `${insight.feedCountToday}/${insight.targetFeedsPerDay} · ${insight.totalOzToday}oz`;
  }

  if (hasNursing) {
    return `${insight.feedCountToday}/${insight.targetFeedsPerDay} · ${insight.totalNursingMinutesToday}m`;
  }

  return insight.fedAgo ?? '—';
}

function buildSleepSummary(insight: BabyInsight): string {
  return insight.sleepStatus ? insight.sleepStatus.replace(/^Active · /, '') : '—';
}

function isSameLocalDay(date: Date, now: Date): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getLiveActivityTriggerEvent(
  babyId: string,
  latest: LatestEventMap,
  now: Date,
): TrackerEvent | null {
  const napEvent = latest[`${babyId}:nap`];
  const sleepEvent = latest[`${babyId}:sleep`];
  const bottleEvent = latest[`${babyId}:bottle`];
  const nursingEvent = latest[`${babyId}:nursing`];
  const pumpEvent = latest[`${babyId}:pump`];

  const candidates = [napEvent, sleepEvent, bottleEvent, nursingEvent, pumpEvent].filter(
    (event): event is TrackerEvent => !!event,
  );
  if (candidates.length === 0) {
    return null;
  }

  const relevantCandidates = candidates.filter(event => {
    if ((event.type === 'nap' || event.type === 'sleep') && !event.endedAt) {
      return true;
    }
    return isSameLocalDay(new Date(event.startedAt), now);
  });

  if (relevantCandidates.length === 0) {
    return null;
  }

  return relevantCandidates.reduce((latestEvent, currentEvent) =>
    new Date(currentEvent.startedAt).getTime() > new Date(latestEvent.startedAt).getTime()
      ? currentEvent
      : latestEvent,
  );
}

function buildBabySnapshot(
  baby: Baby,
  latest: LatestEventMap,
  events: TrackerEvent[],
  prefs: PreferencesLike,
  now: Date,
): LiveActivityBabySnapshot | null {
  const triggerEvent = getLiveActivityTriggerEvent(baby.id, latest, now);
  if (!triggerEvent) {
    return null;
  }

  const sleepEvent = latest[`${baby.id}:sleep`];
  const hasActiveSleep = sleepEvent != null && !sleepEvent.endedAt;
  const recentEvent = getMostRecentEvent(events, baby.id);
  const insight = getBabyInsight(
    baby,
    latest,
    events,
    now,
    prefs.wakeHour,
    undefined,
    prefs.bedtimeHour,
    prefs.wakeHour,
  );
  const nextPrediction = getPrimaryLiveActivityPrediction(
    insight.predictions,
    triggerEvent.type as LiveActivityEventType,
    insight.scheduleStage,
    hasActiveSleep,
  );
  const shouldHideNextAction = hasActiveSleep && insight.scheduleStage >= 2;
  const feedPrediction = getPredictionByType(insight.predictions, 'bottle');
  const napPrediction = getPredictionByType(insight.predictions, 'nap');
  const diaperPrediction = getPredictionByType(insight.predictions, 'diaper');

  return {
    babyId: baby.id,
    babyName: baby.name,
    babyColor: baby.color,
    eventId: triggerEvent.id,
    eventType: triggerEvent.type as LiveActivityEventType,
    startedAt: triggerEvent.startedAt,
    headline: insight.headline,
    narrative: insight.narrative,
    urgency: insight.urgency,
    lastEventLabel: recentEvent ? eventLabel(recentEvent) : null,
    lastEventAt: recentEvent?.startedAt ?? null,
    nextActionType: nextPrediction?.type ?? null,
    nextActionLabel: nextPrediction ? getPredictionLabel(nextPrediction.type) : null,
    nextTargetAt: nextPrediction
      ? new Date(now.getTime() + nextPrediction.remainingMs).toISOString()
      : null,
    nextSummary: shouldHideNextAction ? null : nextPrediction?.label ?? insight.narrative ?? null,
    feedSummary: buildFeedSummary(insight),
    feedUrgency: feedPrediction?.urgency ?? 'ok',
    feedMode: insight.feedTriageMode,
    sleepSummary: buildSleepSummary(insight),
    sleepUrgency: napPrediction?.urgency ?? (insight.sleepStatus ? insight.urgency : 'ok'),
    diaperSummary: insight.changedAgo ?? '—',
    diaperUrgency: diaperPrediction?.urgency ?? 'ok',
  };
}

export function buildLiveActivitySnapshots(
  babies: Baby[],
  latest: LatestEventMap,
  events: TrackerEvent[],
  prefs: PreferencesLike,
  now = new Date(),
): LiveActivitySnapshot[] {
  return babies
    .map(baby => buildBabySnapshot(baby, latest, events, prefs, now))
    .filter((snapshot): snapshot is LiveActivityBabySnapshot => snapshot != null)
    .map(snapshot => ({
      activityId: `twintracker:baby:${snapshot.babyId}`,
      babies: [snapshot],
    }));
}
