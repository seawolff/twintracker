import { pool } from './db';
import { sendChildStageDigestEmail } from './email';

const MS_PER_DAY = 24 * 60 * 60_000;
let digestDeliveriesTableMissing = false;

interface HouseholdBaby {
  id: string;
  name: string;
  birthDate: string | Date | null;
}

interface HouseholdRecipient {
  id: string;
  email: string;
  displayName: string | null;
}

interface RecentEvent {
  babyId: string;
  type: string;
  value?: number | null;
  notes?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

interface StageDigestContext {
  stageKey: string;
  ageLabel: string;
  stageTitle: string;
  stageSummary: string;
  expectations: string[];
  milestoneCues: string[];
}

function toBirthDate(birthDate: string | Date): Date {
  if (birthDate instanceof Date) {
    return new Date(
      Date.UTC(birthDate.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate()),
    );
  }
  return new Date(`${birthDate}T00:00:00.000Z`);
}

function getWholeMonths(birthDate: string | Date, now: Date): number {
  const birth = toBirthDate(birthDate);
  let months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - birth.getUTCMonth());
  if (now.getUTCDate() < birth.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

function formatAgeLabel(months: number): string {
  if (months < 24) {
    return `${months} month${months === 1 ? '' : 's'} old`;
  }
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} old`;
}

function buildStageDigest(months: number): StageDigestContext | null {
  if (months < 1) {
    return null;
  }

  const ageLabel = formatAgeLabel(months);
  if (months < 4) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'Newborn rhythms are still being built',
      stageSummary:
        'This stage is usually about frequent feeds, short wake windows, and learning your baby’s rhythm one day at a time.',
      expectations: [
        'feeding often and tracking output closely',
        'short awake stretches before the next nap',
        'small changes from week to week, not a perfectly consistent schedule yet',
      ],
      milestoneCues: [
        'lifting the head a little more during tummy time',
        'settling a bit faster around familiar voices or routines',
        'more alert eye contact during awake stretches',
      ],
    };
  }
  if (months < 7) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'A more predictable routine may start to emerge',
      stageSummary:
        'Around this stage, many babies begin to show longer wake windows, more social engagement, and more recognizable daily patterns.',
      expectations: [
        'longer stretches between some feeds',
        'more alert playtime and social interaction',
        'sleep starting to consolidate, even if it is still uneven',
      ],
      milestoneCues: [
        'more smiling, cooing, and social engagement',
        'stronger head control and more purposeful movement',
        'starting to reach for toys or hands',
      ],
    };
  }
  if (months < 10) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'Mobility and curiosity tend to pick up fast',
      stageSummary:
        'This stage often comes with more movement, stronger opinions, and a day that can feel busier even when naps are starting to consolidate.',
      expectations: [
        'rolling, sitting, scooting, or early crawling',
        'more babbling and stronger reactions to familiar people',
        'changing nap patterns as the day matures',
      ],
      milestoneCues: [
        'rolling both ways or getting more mobile',
        'sitting with less support',
        'more back-and-forth sounds and playful reactions',
      ],
    };
  }
  if (months < 13) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'Communication and movement usually keep expanding',
      stageSummary:
        'Many babies this age are exploring the room, building hand skills, and showing more obvious preferences around sleep, food, and comfort.',
      expectations: [
        'pulling up, cruising, or testing more movement',
        'more finger foods, textures, and feeding independence',
        'stronger separation awareness or bedtime preferences',
      ],
      milestoneCues: [
        'pincer-grasp practice with small foods or toys',
        'pulling to stand or cruising along furniture',
        'clearer reactions to names, routines, and familiar people',
      ],
    };
  }
  if (months < 19) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'Early toddler patterns start to replace baby patterns',
      stageSummary:
        'This stage is often less about tiny daily changes and more about growing independence, stronger communication, and a steadier routine.',
      expectations: [
        'more expressive communication, gestures, or first words',
        'stronger preferences and more independence at mealtimes',
        'nap and bedtime rhythms feeling more established',
      ],
      milestoneCues: [
        'pointing, waving, or other clear gestures',
        'first words or more intentional sounds',
        'walking, climbing, or more confident movement',
      ],
    };
  }
  if (months < 24) {
    return {
      stageKey: `month:${months}`,
      ageLabel,
      stageTitle: 'Toddler routines usually become clearer',
      stageSummary:
        'This stage can bring a more recognizable family rhythm, even while your child keeps changing quickly in language, movement, and mood.',
      expectations: [
        'more imitation, pointing, and simple communication',
        'clearer opinions, routines, and transitions',
        'one-nap days and more predictable sleep pressure',
      ],
      milestoneCues: [
        'copying simple actions or routines',
        'more recognizable words, gestures, or requests',
        'steadier movement and stronger problem-solving play',
      ],
    };
  }

  const years = Math.floor(months / 12);
  return {
    stageKey: `year:${years}`,
    ageLabel,
    stageTitle: 'This stage is more about routines, language, and independence',
    stageSummary:
      'As babies move into toddler and early-childhood years, the big shifts are often around communication, confidence, and daily rhythms that fit your family better.',
    expectations: [
      'more language, imitation, and personality showing up every day',
      'steadier meal and sleep expectations than the baby months',
      'new opinions, transitions, and independence that need patience as much as structure',
    ],
    milestoneCues: [
      'more words, imitation, and pretend play',
      'clearer independence around meals, movement, and routines',
      'bigger feelings and stronger opinions during transitions',
    ],
  };
}

function formatHours(ms: number): string {
  return `${(ms / (60 * 60_000)).toFixed(1)} hours`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function buildTrendBullets(events: RecentEvent[]): string[] {
  if (!events.length) {
    return ['There is not enough logged in the last month yet to summarize trends.'];
  }

  const feedEvents = events.filter(e => e.type === 'bottle' || e.type === 'nursing');
  const bottleEvents = events.filter(e => e.type === 'bottle' && Number(e.value ?? 0) > 0);
  const sleepEvents = events.filter(
    e =>
      (e.type === 'nap' || e.type === 'sleep') &&
      e.endedAt != null &&
      new Date(e.endedAt).getTime() > new Date(e.startedAt).getTime(),
  );
  const nightSleepEvents = sleepEvents.filter(e => e.type === 'sleep');
  const diaperEvents = events.filter(e => e.type === 'diaper');
  const foodEvents = events.filter(e => e.type === 'food');
  const milestoneEvents = events.filter(e => e.type === 'milestone');

  const firstMs = Math.min(...events.map(e => new Date(e.startedAt).getTime()));
  const lastMs = Math.max(...events.map(e => new Date(e.startedAt).getTime()));
  const spanDays = Math.max(1, Math.min(30, Math.ceil((lastMs - firstMs) / MS_PER_DAY) + 1));

  const bullets: string[] = [];

  if (feedEvents.length > 0) {
    bullets.push(`about ${(feedEvents.length / spanDays).toFixed(1)} feeds per day on average`);
  }

  if (bottleEvents.length > 0) {
    const totalOz = bottleEvents.reduce((sum, e) => sum + Number(e.value ?? 0), 0);
    bullets.push(`about ${(totalOz / spanDays).toFixed(1)} oz logged per day`);
  }

  if (sleepEvents.length > 0) {
    const totalSleepMs = sleepEvents.reduce(
      (sum, e) => sum + (new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime()),
      0,
    );
    bullets.push(`about ${formatHours(totalSleepMs / spanDays)} of total sleep per day`);
  }

  if (nightSleepEvents.length > 0) {
    const longestNight = Math.max(
      ...nightSleepEvents.map(
        e => new Date(e.endedAt!).getTime() - new Date(e.startedAt).getTime(),
      ),
    );
    bullets.push(`a longest night stretch of ${formatDuration(longestNight)} this month`);
  }

  if (diaperEvents.length > 0) {
    bullets.push(`about ${(diaperEvents.length / spanDays).toFixed(1)} diapers per day`);
  }

  if (foodEvents.length > 0) {
    bullets.push(
      `${foodEvents.length} solid-food log${foodEvents.length === 1 ? '' : 's'} this month`,
    );
  }

  if (milestoneEvents.length > 0) {
    bullets.push(
      `${milestoneEvents.length} milestone log${milestoneEvents.length === 1 ? '' : 's'} this month`,
    );
  }

  return bullets.length > 0
    ? bullets.slice(0, 4)
    : ['There is not enough logged in the last month yet to summarize trends.'];
}

function buildMilestoneBullets(events: RecentEvent[], stage: StageDigestContext): string[] {
  const milestoneNotes = events
    .filter(e => e.type === 'milestone' && typeof e.notes === 'string' && e.notes.trim())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map(e => e.notes!.trim());

  const uniqueNotes = Array.from(new Set(milestoneNotes));
  if (uniqueNotes.length > 0) {
    return uniqueNotes.slice(0, 3).map(note => `recently logged: ${note}`);
  }

  return stage.milestoneCues;
}

export async function maybeSendDueChildStageDigests({
  householdId,
  locale = 'en',
  now = new Date(),
}: {
  householdId: string;
  locale?: string;
  now?: Date;
}): Promise<void> {
  if (digestDeliveriesTableMissing) {
    return;
  }
  const { rows: babyRows } = await pool.query(
    `SELECT id, name, birth_date AS "birthDate"
     FROM babies
     WHERE household_id = $1 AND birth_date IS NOT NULL
     ORDER BY created_at ASC`,
    [householdId],
  );
  const babies = babyRows as HouseholdBaby[];
  if (!babies.length) {
    return;
  }

  const dueBabies = babies
    .map(baby => {
      if (!baby.birthDate) {
        return null;
      }
      const stage = buildStageDigest(getWholeMonths(baby.birthDate, now));
      return stage ? { ...baby, stage } : null;
    })
    .filter((baby): baby is HouseholdBaby & { stage: StageDigestContext } => baby !== null);
  if (!dueBabies.length) {
    return;
  }

  const { rows: recipientRows } = await pool.query(
    `SELECT id, email, display_name AS "displayName"
     FROM users
     WHERE household_id = $1
       AND membership_role = 'active'
       AND email_verified = true
     ORDER BY created_at ASC`,
    [householdId],
  );
  const recipients = recipientRows as HouseholdRecipient[];
  if (!recipients.length) {
    return;
  }

  const { rows: eventRows } = await pool.query(
    `SELECT baby_id AS "babyId",
            type,
            value,
            notes,
            started_at AS "startedAt",
            ended_at AS "endedAt"
     FROM events
     WHERE deleted_at IS NULL
       AND baby_id = ANY($1::uuid[])
       AND started_at >= $2::timestamptz
     ORDER BY started_at DESC`,
    [dueBabies.map(baby => baby.id), new Date(now.getTime() - 35 * MS_PER_DAY).toISOString()],
  );

  const eventsByBaby = new Map<string, RecentEvent[]>();
  for (const row of eventRows as RecentEvent[]) {
    const list = eventsByBaby.get(row.babyId) ?? [];
    list.push(row);
    eventsByBaby.set(row.babyId, list);
  }

  for (const baby of dueBabies) {
    const babyEvents = eventsByBaby.get(baby.id) ?? [];
    const trendBullets = buildTrendBullets(babyEvents);
    const milestoneBullets = buildMilestoneBullets(babyEvents, baby.stage);
    for (const recipient of recipients) {
      let insertResult;
      try {
        insertResult = await pool.query(
          `INSERT INTO child_stage_digest_deliveries (baby_id, user_id, stage_key)
           VALUES ($1, $2, $3)
           ON CONFLICT (baby_id, user_id, stage_key) DO NOTHING
           RETURNING id`,
          [baby.id, recipient.id, baby.stage.stageKey],
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '42P01') {
          digestDeliveriesTableMissing = true;
          console.error(
            'Child stage digest delivery table missing. Restart the API so the latest migration runs.',
          );
          return;
        }
        throw err;
      }
      if (!insertResult.rowCount) {
        continue;
      }

      try {
        await sendChildStageDigestEmail({
          email: recipient.email,
          recipientName: recipient.displayName,
          babyName: baby.name,
          ageLabel: baby.stage.ageLabel,
          stageTitle: baby.stage.stageTitle,
          stageSummary: baby.stage.stageSummary,
          expectations: baby.stage.expectations,
          milestoneBullets,
          trendBullets,
          locale,
        });
      } catch (err) {
        await pool.query(
          `DELETE FROM child_stage_digest_deliveries
           WHERE baby_id = $1 AND user_id = $2 AND stage_key = $3`,
          [baby.id, recipient.id, baby.stage.stageKey],
        );
        console.error('Failed to send child stage digest email:', err);
      }
    }
  }
}

export const __childStageDigest = {
  getWholeMonths,
  formatAgeLabel,
  buildStageDigest,
  buildTrendBullets,
  buildMilestoneBullets,
};
