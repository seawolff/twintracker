#!/usr/bin/env node
'use strict';

// Allow self-signed certs for remote DBs (Railway, staging) in non-production Node processes.
// The actual production API runs on Railway itself (same network, no proxy cert issues).
const _url = process.env.DATABASE_URL ?? '';
const _isRemote =
  !_url.includes('localhost') && !_url.includes('127.0.0.1') && !_url.includes('@db:');
if (_isRemote) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { Pool } = require('pg');

const pool = new Pool({ connectionString: _url });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS babies (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT 'amber',
        birth_date  DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id    UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        value      NUMERIC,
        unit       TEXT,
        notes      TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at   TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS events_baby_id_started_at ON events(baby_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS events_created_at ON events(created_at DESC);
    `);

    // Migration 2: households + invite codes
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS household_id UUID,
        ADD COLUMN IF NOT EXISTS invite_code  TEXT;

      UPDATE users
      SET household_id = gen_random_uuid(),
          invite_code  = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
      WHERE household_id IS NULL;

      ALTER TABLE users
        ALTER COLUMN household_id SET NOT NULL,
        ALTER COLUMN invite_code  SET NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code ON users(invite_code);

      ALTER TABLE babies ADD COLUMN IF NOT EXISTS household_id UUID;

      UPDATE babies b
      SET household_id = u.household_id
      FROM users u
      WHERE b.user_id = u.id AND b.household_id IS NULL;

      ALTER TABLE babies ALTER COLUMN household_id SET NOT NULL;

      CREATE INDEX IF NOT EXISTS babies_household_id ON babies(household_id);
    `);

    // Migration 3: is_admin column
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    `);

    // Migration 4: updated_at for delta sync of edits
    await client.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE OR REPLACE FUNCTION events_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS events_updated_at_trigger ON events;
      CREATE TRIGGER events_updated_at_trigger
        BEFORE UPDATE ON events
        FOR EACH ROW EXECUTE FUNCTION events_set_updated_at();

      UPDATE events SET updated_at = created_at WHERE updated_at = created_at;

      CREATE INDEX IF NOT EXISTS events_updated_at ON events(updated_at DESC);
    `);

    // Migration 5: soft deletes — deleted_at for cross-device sync
    await client.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    // Migration 6: index on type for analytics/learned-schedule filter performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS events_household_type ON events(baby_id, type, started_at DESC);
    `);

    // Migration 7: rename event type 'breast' → 'nursing'
    await client.query(`
      UPDATE events SET type = 'nursing' WHERE type = 'breast';
    `);

    // Migration 8: household preferences — sync settings across devices
    await client.query(`
      CREATE TABLE IF NOT EXISTS household_preferences (
        household_id UUID PRIMARY KEY,
        data         JSONB NOT NULL DEFAULT '{}',
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Migration 9: nap alarms — server-side timer so all devices fire + dismiss in sync
    await client.query(`
      CREATE TABLE IF NOT EXISTS nap_alarms (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id      UUID NOT NULL,
        household_id UUID NOT NULL,
        fires_at     TIMESTAMPTZ NOT NULL,
        duration_ms  INT NOT NULL,
        label        TEXT NOT NULL,
        dismissed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS nap_alarms_household
        ON nap_alarms(household_id, dismissed_at, fires_at);
    `);

    // Migration 10: parent attribution — display name + who logged each event
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS logged_by UUID REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS events_logged_by ON events(logged_by);
    `);

    // Migration 11: email verification — token + verified flag
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS users_email_verification_token ON users(email_verification_token);

      -- Mark all existing accounts as verified so current users are unaffected.
      UPDATE users SET email_verified = true WHERE email_verified = false;
    `);

    // Migration 12: baby growth measurements — weight (kg), height (cm), sex
    // Used for WHO growth percentile calculations in analytics.
    await client.query(`
      ALTER TABLE babies ADD COLUMN IF NOT EXISTS weight_kg  FLOAT;
      ALTER TABLE babies ADD COLUMN IF NOT EXISTS height_cm  FLOAT;
      ALTER TABLE babies ADD COLUMN IF NOT EXISTS sex        VARCHAR(10);
    `);

    // Migration 13: Google SSO — google_id for OAuth identity linking.
    // password_hash becomes nullable so Google-only accounts don't need a password.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    `);

    // Migration 14: analytics — last_seen_at + verified_email_at on users;
    // user_cohorts table with NO FK so rows survive account deletion.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_email_at TIMESTAMPTZ;

      -- Backfill: treat created_at as last_seen for existing accounts.
      UPDATE users SET last_seen_at = created_at WHERE last_seen_at IS NULL;
      -- Backfill: treat created_at as verified_at for accounts already verified.
      UPDATE users SET verified_email_at = created_at
        WHERE email_verified = true AND verified_email_at IS NULL;

      CREATE TABLE IF NOT EXISTS user_cohorts (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Temporal bucketing — ISO week (Monday), not exact date, to reduce re-identification risk.
        cohort_week         DATE NOT NULL,

        -- Acquisition context
        locale              TEXT,
        platform            TEXT,          -- 'web' | 'ios' | 'android'
        used_google_sso     BOOLEAN NOT NULL DEFAULT false,
        joined_household    BOOLEAN NOT NULL DEFAULT false,

        -- Onboarding signals (set after babies created)
        baby_count          SMALLINT,
        has_twins           BOOLEAN,
        min_baby_stage      SMALLINT,

        -- Lifecycle timestamps
        registered_at       TIMESTAMPTZ NOT NULL,
        verified_email_at   TIMESTAMPTZ,
        first_event_at      TIMESTAMPTZ,
        last_seen_at        TIMESTAMPTZ,
        deleted_at          TIMESTAMPTZ,   -- set on DELETE /auth/me; row is retained

        -- D1/D7/D30/D90 retention flags — set true when milestone reached, never unset
        retained_d1         BOOLEAN NOT NULL DEFAULT false,
        retained_d7         BOOLEAN NOT NULL DEFAULT false,
        retained_d30        BOOLEAN NOT NULL DEFAULT false,
        retained_d90        BOOLEAN NOT NULL DEFAULT false,

        -- Feature adoption flags — set true on first use, never unset
        used_alarm          BOOLEAN NOT NULL DEFAULT false,
        used_analytics      BOOLEAN NOT NULL DEFAULT false,
        used_twin_sync      BOOLEAN NOT NULL DEFAULT false,
        used_baby_profile   BOOLEAN NOT NULL DEFAULT false,
        invited_coparent    BOOLEAN NOT NULL DEFAULT false,

        -- Aggregate activity — counts only, no content
        total_events_logged INT NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS user_cohorts_cohort_week ON user_cohorts(cohort_week);
      CREATE INDEX IF NOT EXISTS user_cohorts_platform    ON user_cohorts(platform);
      CREATE INDEX IF NOT EXISTS user_cohorts_deleted_at  ON user_cohorts(deleted_at);

      -- Back-reference so auth routes can look up cohort_id without a JOIN.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cohort_id UUID;

      -- App version at registration time — populated from X-App-Version header.
      ALTER TABLE user_cohorts ADD COLUMN IF NOT EXISTS app_version TEXT;
    `);

    // Migration 15: pre-launch waitlist — email capture with platform interest
    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL,
        platform    TEXT,            -- 'ios' | 'android' | 'both' | NULL (not specified)
        source      TEXT NOT NULL DEFAULT 'landing',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email ON waitlist(lower(email));
    `);

    // Migration 16: UTM tracking columns on waitlist
    await client.query(`
      ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS utm_source   TEXT;
      ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
      ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    `);

    // Migration 17: adjusted birth date for preemie babies — corrected age for
    // schedule stage and growth percentile calculations.
    await client.query(`
      ALTER TABLE babies ADD COLUMN IF NOT EXISTS adjusted_birth_date DATE;
    `);

    // Migration 18: child stage digest delivery dedupe + household membership role.
    // Each verified active family member receives a child-stage digest once per child/stage.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_role TEXT NOT NULL DEFAULT 'active';

      CREATE TABLE IF NOT EXISTS child_stage_digest_deliveries (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        baby_id      UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stage_key    TEXT NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (baby_id, user_id, stage_key)
      );

      CREATE INDEX IF NOT EXISTS child_stage_digest_deliveries_user_id
        ON child_stage_digest_deliveries(user_id);
    `);

    console.log('Migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
