import {
  parseMilestoneNotes as parseMilestoneNotesImpl,
  serializeMilestoneNotes as serializeMilestoneNotesImpl,
  getSuggestedMilestones as getSuggestedMilestonesImpl,
  getRecentMilestones as getRecentMilestonesImpl,
} from '../../core/src/logic/milestones';

// Real logic functions imported directly from core source (pure TS, no side-effects)
export {
  eventLabel,
  eventLabelShort,
  formatTime,
  formatTimeAgo,
  formatEventTime,
  formatDuration,
} from '../../core/src/logic/historyHelpers';
export { groupEventsByDay } from '../../core/src/logic/grouping';
export { authorColor } from '../../core/src/logic/authorUtils';
export { getBabyInsight, formatMs, formatTime12, getAgeWeeks } from '../../core/src/logic/schedule';
export { getNapActionType } from '../../core/src/logic/twinSync';
export { computeLearnedStats } from '../../core/src/logic/learnedSchedule';
export {
  parsePumpNotes,
  parseBottleNotes,
  serializePumpNotes,
  serializeBottleNotes,
  formatPumpStash,
  summarizeStashInventory,
} from '../../core/src/logic/pumpHelpers';
export const parseMilestoneNotes = parseMilestoneNotesImpl;
export const serializeMilestoneNotes = serializeMilestoneNotesImpl;
export const getSuggestedMilestones = getSuggestedMilestonesImpl;
export const getRecentMilestones = getRecentMilestonesImpl;
export const milestoneLabel = (key: string) => `milestones.items.${key}`;
export const formatMilestoneText = (notes?: string | null) => {
  const parsed = parseMilestoneNotesImpl(notes);
  if (parsed.key) {
    const base = milestoneLabel(parsed.key);
    return parsed.detail ? `${base} — ${parsed.detail}` : base;
  }
  return parsed.legacyText ?? 'log_sheet.types.milestone';
};

// Re-export types
export type {
  TrackerEvent,
  Baby,
  EventType,
  LatestEventMap,
  LogEventPayload,
  NapAlarm,
  PredictedAction,
  Urgency,
} from '../../core/src/types';
export type { BabyInsight } from '../../core/src/logic/schedule';

// Mocked hooks — return a minimal but complete theme
export const useThemeContext = () => ({
  mode: 'night' as const,
  bg: '#000000',
  surface: '#111111',
  text: '#ffffff',
  textDim: '#aaaaaa',
  textMuted: '#666666',
  border: '#333333',
  accent: '#44ff99',
  urgencyOverdue: '#ff6666',
  urgencySoon: '#ffaa00',
});

export const useTranslation = () => ({
  t: (key: string, opts?: Record<string, string>) => {
    if (!opts) return key;
    return Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key);
  },
});

export {
  formatLocalDateInputValue,
  isFutureLocalDateInputValue,
  todayLocalDateInputValue,
} from '../../core/src/logic/localDate';
// Stub for parseLocalDateInputValue — not yet in core source; parses YYYY-MM-DD to Date
export function parseLocalDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// All config constants — barrel so the mock stays in sync automatically
export * from '../../core/src/config';

// i18n stub — returns key as-is so test assertions can match on translation keys
const i18nStub = {
  t: (key: string, opts?: Record<string, string>) => {
    if (!opts) return key;
    return Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key);
  },
};
export default i18nStub;
export const i18n = i18nStub;

// Stubs for anything BabyCard/HistoryFeed might import but tests don't exercise
export const initI18n = () => {};
export const ThemeProvider = ({ children }: { children: any }) => children;
export const configure = () => {};
