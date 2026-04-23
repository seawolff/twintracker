import i18n from '../i18n';
import type { TrackerEvent } from '../types';
import { ageInMonths } from './growthPercentiles';

export type MilestoneCategory = 'social' | 'language' | 'cognitive' | 'movement';

export interface MilestoneDefinition {
  key: string;
  ageMonths: number;
  category: MilestoneCategory;
}

const MILESTONE_NOTE_PREFIX = 'milestone:';

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  { key: 'tracks_face', ageMonths: 0, category: 'cognitive' },
  { key: 'lifts_head', ageMonths: 2, category: 'movement' },
  { key: 'social_smile', ageMonths: 2, category: 'social' },
  { key: 'laughs', ageMonths: 4, category: 'social' },
  { key: 'rolls_over', ageMonths: 4, category: 'movement' },
  { key: 'babbles', ageMonths: 6, category: 'language' },
  { key: 'sits_with_support', ageMonths: 6, category: 'movement' },
  { key: 'responds_to_name', ageMonths: 9, category: 'language' },
  { key: 'sits_without_support', ageMonths: 9, category: 'movement' },
  { key: 'pulls_to_stand', ageMonths: 12, category: 'movement' },
  { key: 'waves_bye', ageMonths: 12, category: 'social' },
  { key: 'first_word', ageMonths: 12, category: 'language' },
  { key: 'walks_independently', ageMonths: 18, category: 'movement' },
  { key: 'points_to_wanted_objects', ageMonths: 18, category: 'cognitive' },
  { key: 'several_words', ageMonths: 18, category: 'language' },
  { key: 'two_word_phrases', ageMonths: 24, category: 'language' },
  { key: 'kicks_ball', ageMonths: 24, category: 'movement' },
  { key: 'pretend_play', ageMonths: 24, category: 'cognitive' },
] as const;

interface ParsedMilestoneNotes {
  key: string | null;
  detail: string | null;
  legacyText: string | null;
}

function milestoneLabelKey(key: string): string {
  return `milestones.items.${key}`;
}

export function parseMilestoneNotes(notes?: string | null): ParsedMilestoneNotes {
  const raw = notes?.trim();
  if (!raw) {
    return { key: null, detail: null, legacyText: null };
  }

  if (!raw.startsWith(MILESTONE_NOTE_PREFIX)) {
    return { key: null, detail: null, legacyText: raw };
  }

  const params = new URLSearchParams(raw.slice(MILESTONE_NOTE_PREFIX.length));
  const key = params.get('key');
  const detail = params.get('detail')?.trim() || null;
  return {
    key: key && MILESTONE_DEFINITIONS.some(item => item.key === key) ? key : null,
    detail,
    legacyText: null,
  };
}

export function serializeMilestoneNotes(key: string | null, detail?: string): string {
  const trimmedDetail = detail?.trim() ?? '';
  if (!key) {
    return trimmedDetail;
  }
  const params = new URLSearchParams({ key });
  if (trimmedDetail) {
    params.set('detail', trimmedDetail);
  }
  return `${MILESTONE_NOTE_PREFIX}${params.toString()}`;
}

export function formatMilestoneText(notes?: string | null): string {
  const parsed = parseMilestoneNotes(notes);
  if (parsed.key) {
    const base = i18n.t(milestoneLabelKey(parsed.key));
    return parsed.detail ? `${base} — ${parsed.detail}` : base;
  }
  return parsed.legacyText ?? i18n.t('log_sheet.types.milestone');
}

export function milestoneLabel(key: string): string {
  return i18n.t(milestoneLabelKey(key));
}

export function getSuggestedMilestones(
  birthDate?: string,
  now: Date = new Date(),
): MilestoneDefinition[] {
  const months = ageInMonths(birthDate, now);
  if (months == null) {
    return MILESTONE_DEFINITIONS.filter(item => item.ageMonths <= 6);
  }

  const roundedAge = Math.max(0, Math.min(24, Math.round(months)));
  const currentBucket = MILESTONE_DEFINITIONS.filter(item => item.ageMonths <= roundedAge).slice(-6);
  const upcomingBucket = MILESTONE_DEFINITIONS.filter(
    item => item.ageMonths > roundedAge && item.ageMonths <= roundedAge + 3,
  ).slice(0, 3);
  return [...currentBucket, ...upcomingBucket];
}

export function getRecentMilestones(events: TrackerEvent[], limit = 3): TrackerEvent[] {
  return events
    .filter(event => event.type === 'milestone')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}
