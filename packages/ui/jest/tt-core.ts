// Real logic functions imported directly from core source (pure TS, no side-effects)
export {
  eventLabel,
  formatTime,
  formatTimeAgo,
  formatDuration,
} from '../../core/src/logic/historyHelpers';
export { groupEventsByDay } from '../../core/src/logic/grouping';
export { authorColor } from '../../core/src/logic/authorUtils';
export { getBabyInsight, formatMs, formatTime12 } from '../../core/src/logic/schedule';
export { getNapActionType } from '../../core/src/logic/twinSync';
export { computeLearnedStats } from '../../core/src/logic/learnedSchedule';

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
