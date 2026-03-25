#!/usr/bin/env node
'use strict';
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
