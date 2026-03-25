import type { Baby, LogEventPayload } from '../types/index';

function jitter(ms: number, spreadMs: number): number {
  return ms + (Math.random() - 0.5) * 2 * spreadMs;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DIAPER_TYPES = ['wet', 'dirty', 'both'] as const;
const FOOD_DESCRIPTIONS = [
  'banana puree',
  'oatmeal',
  'sweet potato',
  'peas',
  'avocado',
  'rice cereal',
  'pear puree',
];
const MILESTONES = [
  'First smile',
  'Rolled over',
  'First word: dada',
  'Sat up unassisted',
  'First solid food',
];

/**
 * Generate 30 days of realistic mock events for the given babies.
 * Call clearAllEvents() before applying these to start fresh.
 */
export function generateMockEvents(babies: Baby[], days = 30, now = new Date()): LogEventPayload[] {
  const payloads: LogEventPayload[] = [];
  const nowMs = now.getTime();
  const startMs = nowMs - days * 24 * 60 * 60_000;

  for (const baby of babies) {
    // Typical daily schedule for a ~4-month-old
    const feedIntervalMs = jitter(3 * 60 * 60_000, 20 * 60_000); // ~3h ± 20m
    const napIntervalMs = jitter(2 * 60 * 60_000, 15 * 60_000); // ~2h awake window
    const napDurationMs = jitter(75 * 60_000, 20 * 60_000); // ~75m nap ± 20m
    const diaperPerDay = 7 + Math.floor(Math.random() * 3); // 7–9/day

    let cursor = startMs;

    // ── Feeds (bottle every ~3h) ────────────────────────────────────────────
    while (cursor < nowMs) {
      const oz = pick([4, 4, 5, 5, 6, 4, 5]);
      payloads.push({
        babyId: baby.id,
        type: 'bottle',
        startedAt: new Date(cursor).toISOString(),
        value: oz,
        unit: 'oz',
      });
      cursor += jitter(feedIntervalMs, 15 * 60_000);
    }

    // ── Naps (2–3/day, awake window ~2h) ────────────────────────────────────
    cursor = startMs;
    // Offset each baby slightly so twins don't log at identical ms
    cursor += babies.indexOf(baby) * 3 * 60_000;

    while (cursor < nowMs) {
      const dur = Math.max(20 * 60_000, jitter(napDurationMs, 15 * 60_000));
      const endMs = cursor + dur;
      if (endMs < nowMs) {
        payloads.push({
          babyId: baby.id,
          type: 'nap',
          startedAt: new Date(cursor).toISOString(),
          endedAt: new Date(endMs).toISOString(),
        });
      }
      cursor = endMs + jitter(napIntervalMs, 10 * 60_000);
    }

    // ── Night sleep (one per night, ~8–10h starting around 7–8pm) ───────────
    for (let d = 0; d < days; d++) {
      const dayStart = startMs + d * 24 * 60 * 60_000;
      // Bedtime: 7pm ± 30m
      const bedtimeMs = dayStart + jitter(19 * 60 * 60_000, 30 * 60_000);
      // Duration: 8–10h ± 20m
      const nightDurMs = Math.max(7 * 60 * 60_000, jitter(9 * 60 * 60_000, 60 * 60_000));
      const wakeMs = bedtimeMs + nightDurMs;
      if (bedtimeMs < nowMs && wakeMs < nowMs) {
        payloads.push({
          babyId: baby.id,
          type: 'sleep',
          startedAt: new Date(bedtimeMs).toISOString(),
          endedAt: new Date(wakeMs).toISOString(),
        });
      }
    }

    // ── Diapers (random spread through each day) ─────────────────────────────
    for (let d = 0; d < days; d++) {
      const dayStart = startMs + d * 24 * 60 * 60_000;
      const count = diaperPerDay + Math.floor(Math.random() * 3) - 1;
      for (let i = 0; i < count; i++) {
        const t = dayStart + (i / count) * 24 * 60 * 60_000 + jitter(0, 30 * 60_000);
        if (t < nowMs) {
          payloads.push({
            babyId: baby.id,
            type: 'diaper',
            startedAt: new Date(t).toISOString(),
            notes: pick(DIAPER_TYPES),
          });
        }
      }
    }

    // ── Solid foods (once/day for last 14 days, if applicable) ───────────────
    for (let d = days - 14; d < days; d++) {
      if (d < 0) {
        continue;
      }
      const t = startMs + d * 24 * 60 * 60_000 + jitter(12 * 60 * 60_000, 60 * 60_000);
      if (t < nowMs) {
        payloads.push({
          babyId: baby.id,
          type: 'food',
          startedAt: new Date(t).toISOString(),
          notes: pick(FOOD_DESCRIPTIONS),
        });
      }
    }

    // ── A few milestones spread over the period ───────────────────────────────
    const milestoneCount = Math.min(MILESTONES.length, 3);
    for (let i = 0; i < milestoneCount; i++) {
      const t = startMs + ((i + 1) / (milestoneCount + 1)) * days * 24 * 60 * 60_000;
      payloads.push({
        babyId: baby.id,
        type: 'milestone',
        startedAt: new Date(t).toISOString(),
        notes: MILESTONES[i],
      });
    }
  }

  // Sort chronologically
  return payloads.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}
