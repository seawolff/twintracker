/**
 * Analytics cohort helpers.
 *
 * user_cohorts has NO foreign key to users — rows survive account deletion.
 * All writes are fire-and-forget (never block a response).
 *
 * Platform is detected from the X-Platform request header sent by the API client.
 * Valid values: 'web' | 'ios' | 'android'. Falls back to 'web'.
 */

import type { IncomingHttpHeaders } from 'http';
import { pool } from './db';

export type Platform = 'web' | 'ios' | 'android';

const VALID_PLATFORMS = new Set<string>(['web', 'ios', 'android']);

export function resolvePlatform(headers: IncomingHttpHeaders): Platform {
  const h = headers['x-platform'];
  const v = (Array.isArray(h) ? h[0] : (h ?? '')).toLowerCase();
  return VALID_PLATFORMS.has(v) ? (v as Platform) : 'web';
}

export function resolveAppVersion(headers: IncomingHttpHeaders): string | null {
  const h = headers['x-app-version'];
  const v = Array.isArray(h) ? h[0] : (h ?? '');
  return v.trim() || null;
}

/** ISO week Monday — truncate a date to the start of its ISO week. */
function isoWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Create a cohort row at registration. Returns the new cohort id. */
export async function createCohort(opts: {
  registeredAt: Date;
  locale: string | undefined;
  platform: Platform;
  appVersion: string | null;
  usedGoogleSso: boolean;
  joinedHousehold: boolean;
}): Promise<string> {
  const cohortWeek = isoWeekMonday(opts.registeredAt);
  const locale = opts.locale ? opts.locale.slice(0, 2).toLowerCase() : null;
  const { rows } = await pool.query(
    `INSERT INTO user_cohorts
       (cohort_week, locale, platform, app_version, used_google_sso, joined_household, registered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      cohortWeek,
      locale,
      opts.platform,
      opts.appVersion,
      opts.usedGoogleSso,
      opts.joinedHousehold,
      opts.registeredAt,
    ],
  );
  return rows[0].id as string;
}

/** Upsert last_seen_at on users and mirror it to the cohort row. Fire-and-forget. */
export function touchLastSeen(
  userId: string,
  cohortId: string | null,
  now: Date = new Date(),
): void {
  pool
    .query('UPDATE users SET last_seen_at = $1 WHERE id = $2', [now, userId])
    .catch(err => console.error('[cohorts] touchLastSeen users:', err));

  if (cohortId) {
    // Update last_seen and retention milestone flags in one statement.
    pool
      .query(
        `UPDATE user_cohorts SET
           last_seen_at = $1,
           retained_d1  = retained_d1  OR EXTRACT(EPOCH FROM ($1 - registered_at)) >= 86400,
           retained_d7  = retained_d7  OR EXTRACT(EPOCH FROM ($1 - registered_at)) >= 604800,
           retained_d30 = retained_d30 OR EXTRACT(EPOCH FROM ($1 - registered_at)) >= 2592000,
           retained_d90 = retained_d90 OR EXTRACT(EPOCH FROM ($1 - registered_at)) >= 7776000
         WHERE id = $2`,
        [now, cohortId],
      )
      .catch(err => console.error('[cohorts] touchLastSeen cohort:', err));
  }
}

/** Set verified_email_at on both users and cohort. Fire-and-forget. */
export function markEmailVerified(
  userId: string,
  cohortId: string | null,
  now: Date = new Date(),
): void {
  pool
    .query('UPDATE users SET verified_email_at = $1 WHERE id = $2 AND verified_email_at IS NULL', [
      now,
      userId,
    ])
    .catch(err => console.error('[cohorts] markEmailVerified users:', err));

  if (cohortId) {
    pool
      .query(
        'UPDATE user_cohorts SET verified_email_at = $1 WHERE id = $2 AND verified_email_at IS NULL',
        [now, cohortId],
      )
      .catch(err => console.error('[cohorts] markEmailVerified cohort:', err));
  }
}

/** Set first_event_at on the cohort (once). Fire-and-forget. */
export function markFirstEvent(cohortId: string, now: Date = new Date()): void {
  pool
    .query('UPDATE user_cohorts SET first_event_at = $1 WHERE id = $2 AND first_event_at IS NULL', [
      now,
      cohortId,
    ])
    .catch(err => console.error('[cohorts] markFirstEvent:', err));
}

/** Increment total_events_logged. Fire-and-forget. */
export function incrementEventCount(cohortId: string): void {
  pool
    .query('UPDATE user_cohorts SET total_events_logged = total_events_logged + 1 WHERE id = $1', [
      cohortId,
    ])
    .catch(err => console.error('[cohorts] incrementEventCount:', err));
}

/** Set a boolean feature-adoption flag (idempotent). Fire-and-forget. */
export type CohortFlag =
  | 'used_analytics'
  | 'used_twin_sync'
  | 'used_baby_profile'
  | 'invited_coparent';

export function setFlag(cohortId: string, flag: CohortFlag): void {
  pool
    .query(`UPDATE user_cohorts SET ${flag} = true WHERE id = $1`, [cohortId])
    .catch(err => console.error(`[cohorts] setFlag ${flag}:`, err));
}

/** Set onboarding signals after babies are created. Fire-and-forget. */
export function setOnboardingSignals(
  cohortId: string,
  opts: { babyCount: number; hasTwins: boolean; minBabyStage: number },
): void {
  pool
    .query(
      `UPDATE user_cohorts
       SET baby_count = $1, has_twins = $2, min_baby_stage = $3
       WHERE id = $4`,
      [opts.babyCount, opts.hasTwins, opts.minBabyStage, cohortId],
    )
    .catch(err => console.error('[cohorts] setOnboardingSignals:', err));
}

/** Stamp deleted_at on the cohort row (user row is about to be deleted). Fire-and-forget. */
export function markDeleted(cohortId: string, now: Date = new Date()): void {
  pool
    .query('UPDATE user_cohorts SET deleted_at = $1 WHERE id = $2', [now, cohortId])
    .catch(err => console.error('[cohorts] markDeleted:', err));
}
