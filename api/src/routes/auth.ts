import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import type { AuthRequest } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { sendVerificationEmail } from '../email';
import {
  createCohort,
  touchLastSeen,
  markEmailVerified,
  markDeleted,
  resolvePlatform,
  resolveAppVersion,
} from '../cohorts';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateCredentials(email: string, password: string): { message: string } | null {
  if (!EMAIL_RE.test(email)) {
    return { message: 'Invalid email format' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return null;
}

function requireDisplayName(name?: string): { value: string } | { message: string } {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) {
    return { message: 'name required' };
  }
  return { value: trimmed };
}

function signTokens(userId: string, householdId: string, isAdmin = false) {
  const secret = process.env.JWT_SECRET!;
  const accessToken = jwt.sign({ sub: userId, hid: householdId, adm: isAdmin }, secret, {
    expiresIn: '7d',
  });
  const refreshToken = jwt.sign({ sub: userId, hid: householdId, type: 'refresh' }, secret, {
    expiresIn: '90d',
  });
  return { accessToken, refreshToken };
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body as { email: string; password: string; name?: string };
  if (!email || !password) {
    res.status(400).json({ message: 'email and password required' });
    return;
  }
  const credError = validateCredentials(email, password);
  if (credError) {
    res.status(400).json(credError);
    return;
  }
  const validatedName = requireDisplayName(name);
  if ('message' in validatedName) {
    res.status(400).json(validatedName);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const householdId = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id as string;
  const inviteCode = (
    await pool.query(
      `SELECT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)) AS code`,
    )
  ).rows[0].code as string;
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, household_id, invite_code, display_name,
                          email_verification_token, email_verification_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, household_id AS "householdId", invite_code AS "inviteCode", is_admin AS "isAdmin", display_name AS "displayName"`,
      [
        email,
        passwordHash,
        householdId,
        inviteCode,
        validatedName.value,
        verificationToken,
        verificationExpires,
      ],
    );
    const user = rows[0];
    // Create analytics cohort row (fire-and-forget).
    createCohort({
      registeredAt: new Date(),
      locale: req.headers['accept-language'],
      platform: resolvePlatform(req.headers),
      appVersion: resolveAppVersion(req.headers),
      usedGoogleSso: false,
      joinedHousehold: false,
    })
      .then(cohortId =>
        pool.query('UPDATE users SET cohort_id = $1 WHERE id = $2', [cohortId, user.id]),
      )
      .catch(err => console.error('[cohorts] register:', err));
    // Fire-and-forget — don't block the response if email fails.
    sendVerificationEmail(email, verificationToken, req.headers['accept-language']).catch(err =>
      console.error('Failed to send verification email:', err),
    );
    res.status(201).json({
      ...signTokens(user.id, user.householdId, user.isAdmin ?? false),
      inviteCode: user.inviteCode,
      isAdmin: user.isAdmin ?? false,
      displayName: user.displayName ?? null,
      emailVerified: false,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ message: 'Unable to create account. Please try again.' });
    } else {
      throw err;
    }
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const { rows } = await pool.query(
    `SELECT id, password_hash, household_id AS "householdId", invite_code AS "inviteCode",
            is_admin AS "isAdmin", display_name AS "displayName", email_verified AS "emailVerified",
            cohort_id AS "cohortId"
     FROM users WHERE email=$1`,
    [email],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }
  touchLastSeen(user.id, user.cohortId ?? null);
  res.json({
    ...signTokens(user.id, user.householdId, user.isAdmin ?? false),
    inviteCode: user.inviteCode,
    isAdmin: user.isAdmin ?? false,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified ?? false,
  });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as {
      sub: string;
      hid: string;
      type?: string;
    };
    if (payload.type !== 'refresh') {
      throw new Error('not a refresh token');
    }
    res.json(signTokens(payload.sub, payload.hid));
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// POST /auth/join — join an existing household via invite code
router.post('/join', async (req, res) => {
  const { email, password, inviteCode, name } = req.body as {
    email: string;
    password: string;
    inviteCode: string;
    name?: string;
  };
  if (!email || !password || !inviteCode) {
    res.status(400).json({ message: 'email, password, and inviteCode required' });
    return;
  }
  const credError = validateCredentials(email, password);
  if (credError) {
    res.status(400).json(credError);
    return;
  }
  const validatedName = requireDisplayName(name);
  if ('message' in validatedName) {
    res.status(400).json(validatedName);
    return;
  }

  // Look up the household for this invite code
  const { rows: hRows } = await pool.query(
    'SELECT household_id FROM users WHERE invite_code = $1 LIMIT 1',
    [inviteCode.toUpperCase()],
  );
  if (!hRows.length) {
    res.status(404).json({ message: 'Invalid invite code' });
    return;
  }
  const householdId = hRows[0].household_id as string;

  // Generate a new invite code for this new user (each user keeps their own)
  const newInviteCode = (
    await pool.query(
      `SELECT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)) AS code`,
    )
  ).rows[0].code as string;

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, household_id, invite_code, display_name,
                          email_verification_token, email_verification_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, household_id AS "householdId", invite_code AS "inviteCode", is_admin AS "isAdmin", display_name AS "displayName"`,
      [
        email,
        passwordHash,
        householdId,
        newInviteCode,
        validatedName.value,
        verificationToken,
        verificationExpires,
      ],
    );
    const user = rows[0];
    // Create analytics cohort row (fire-and-forget).
    createCohort({
      registeredAt: new Date(),
      locale: req.headers['accept-language'],
      platform: resolvePlatform(req.headers),
      appVersion: resolveAppVersion(req.headers),
      usedGoogleSso: false,
      joinedHousehold: true,
    })
      .then(cohortId =>
        pool.query('UPDATE users SET cohort_id = $1 WHERE id = $2', [cohortId, user.id]),
      )
      .catch(err => console.error('[cohorts] join:', err));
    sendVerificationEmail(email, verificationToken, req.headers['accept-language']).catch(err =>
      console.error('Failed to send verification email:', err),
    );
    res.status(201).json({
      ...signTokens(user.id, user.householdId, user.isAdmin ?? false),
      inviteCode: user.inviteCode,
      isAdmin: user.isAdmin ?? false,
      displayName: user.displayName ?? null,
      emailVerified: false,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ message: 'Unable to create account. Please try again.' });
    } else {
      throw err;
    }
  }
});

// GET /auth/verify-email?token= — consume a verification token and mark email as verified
router.get('/verify-email', async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).json({ message: 'token required' });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE users
     SET email_verified = true, email_verification_token = NULL, email_verification_expires_at = NULL
     WHERE email_verification_token = $1
       AND email_verification_expires_at > NOW()
     RETURNING id, household_id AS "householdId", is_admin AS "isAdmin",
               invite_code AS "inviteCode", display_name AS "displayName",
               cohort_id AS "cohortId"`,
    [token],
  );
  if (!rows.length) {
    res.status(400).json({ message: 'Invalid or expired verification link' });
    return;
  }
  const user = rows[0];
  markEmailVerified(user.id, user.cohortId ?? null);
  touchLastSeen(user.id, user.cohortId ?? null);
  res.json({
    verified: true,
    ...signTokens(user.id, user.householdId, user.isAdmin ?? false),
    inviteCode: user.inviteCode,
    displayName: user.displayName ?? null,
  });
});

// POST /auth/resend-verification — send a fresh verification email (authenticated)
router.post('/resend-verification', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT email, email_verified AS "emailVerified" FROM users WHERE id=$1',
    [req.userId],
  );
  if (!rows.length) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (rows[0].emailVerified) {
    res.json({ message: 'Email already verified' });
    return;
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    `UPDATE users SET email_verification_token=$1, email_verification_expires_at=$2 WHERE id=$3`,
    [token, expires, req.userId],
  );
  sendVerificationEmail(rows[0].email, token, req.headers['accept-language']).catch(err =>
    console.error('Failed to send verification email:', err),
  );
  res.json({ message: 'Verification email sent' });
});

// POST /auth/google — sign in or register via Google ID token
// Verifies the token server-side with Google's tokeninfo endpoint.
// Creates a new account if the google_id/email is not found; links google_id to
// an existing email account if the email matches but no google_id is set yet.
// Optional inviteCode joins an existing household instead of creating one.
router.post('/google', async (req, res) => {
  const { idToken, inviteCode } = req.body as { idToken: string; inviteCode?: string };
  if (!idToken) {
    res.status(400).json({ message: 'idToken required' });
    return;
  }

  // Verify the ID token with Google — this validates the signature and expiry.
  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!tokenInfoRes.ok) {
    res.status(401).json({ message: 'Invalid Google token' });
    return;
  }
  const tokenInfo = (await tokenInfoRes.json()) as {
    sub: string;
    email: string;
    name?: string;
    email_verified?: string;
  };
  if (!tokenInfo.sub || !tokenInfo.email) {
    res.status(401).json({ message: 'Google token missing required fields' });
    return;
  }

  const googleId = tokenInfo.sub;
  const email = tokenInfo.email.toLowerCase();
  const name = tokenInfo.name?.trim() ?? '';

  // Look up existing account by google_id first, then by email.
  const { rows } = await pool.query(
    `SELECT id, household_id AS "householdId", invite_code AS "inviteCode",
            is_admin AS "isAdmin", display_name AS "displayName", google_id AS "googleId",
            cohort_id AS "cohortId"
     FROM users WHERE google_id = $1 OR (lower(email) = $2)
     ORDER BY (google_id = $1) DESC
     LIMIT 1`,
    [googleId, email],
  );
  const existing = rows[0];

  if (existing) {
    // Link google_id if this account was email/password only.
    if (!existing.googleId) {
      await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, existing.id]);
    }
    // Google accounts are always considered email-verified.
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [existing.id]);
    markEmailVerified(existing.id, existing.cohortId ?? null);
    touchLastSeen(existing.id, existing.cohortId ?? null);
    res.json({
      ...signTokens(existing.id, existing.householdId, existing.isAdmin ?? false),
      inviteCode: existing.inviteCode,
      isAdmin: existing.isAdmin ?? false,
      displayName: existing.displayName ?? name,
      emailVerified: true,
    });
    return;
  }

  if (!name) {
    res.status(400).json({ message: 'name required' });
    return;
  }

  // New account — determine household.
  let householdId: string;
  if (inviteCode) {
    // Join an existing household.
    const { rows: hRows } = await pool.query(
      'SELECT household_id FROM users WHERE invite_code = $1 LIMIT 1',
      [inviteCode.toUpperCase()],
    );
    if (!hRows.length) {
      res.status(404).json({ message: 'Invalid invite code' });
      return;
    }
    householdId = hRows[0].household_id as string;
  } else {
    householdId = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id as string;
  }

  const newInviteCode = (
    await pool.query(
      `SELECT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)) AS code`,
    )
  ).rows[0].code as string;

  try {
    const { rows: newRows } = await pool.query(
      `INSERT INTO users (email, household_id, invite_code, display_name, google_id, email_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, household_id AS "householdId", invite_code AS "inviteCode", is_admin AS "isAdmin", display_name AS "displayName"`,
      [email, householdId, newInviteCode, name, googleId],
    );
    const user = newRows[0];
    // Create analytics cohort row (fire-and-forget).
    createCohort({
      registeredAt: new Date(),
      locale: req.headers['accept-language'],
      platform: resolvePlatform(req.headers),
      appVersion: resolveAppVersion(req.headers),
      usedGoogleSso: true,
      joinedHousehold: !!inviteCode,
    })
      .then(cohortId =>
        pool.query('UPDATE users SET cohort_id = $1 WHERE id = $2', [cohortId, user.id]),
      )
      .catch(err => console.error('[cohorts] google register:', err));
    res.status(201).json({
      ...signTokens(user.id, user.householdId, user.isAdmin ?? false),
      inviteCode: user.inviteCode,
      isAdmin: user.isAdmin ?? false,
      displayName: user.displayName ?? null,
      emailVerified: true,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ message: 'Unable to create account. Please try again.' });
    } else {
      throw err;
    }
  }
});

// GET /auth/household/members — list all members in the current household
router.get('/household/members', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, display_name AS "displayName", created_at AS "createdAt"
     FROM users
     WHERE household_id = (SELECT household_id FROM users WHERE id = $1)
     ORDER BY created_at ASC`,
    [req.userId],
  );
  res.json(rows);
});

// GET /auth/me — fetch current user's profile
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, display_name AS "displayName", created_at AS "createdAt",
            email_verified AS "emailVerified" FROM users WHERE id=$1`,
    [req.userId],
  );
  if (!rows.length) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json(rows[0]);
});

// PUT /auth/me — update current user's display name
router.put('/me', requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body as { name?: string };
  const { rows } = await pool.query(
    'UPDATE users SET display_name=$1 WHERE id=$2 RETURNING id, email, display_name AS "displayName", created_at AS "createdAt"',
    [name?.trim() || null, req.userId],
  );
  res.json(rows[0]);
});

// DELETE /auth/me — permanently delete the authenticated user and household data if last member
router.delete('/me', requireAuth, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Stamp deleted_at on cohort row before wiping the user — cohort row is retained for analytics.
    const { rows: cohortRows } = await client.query(
      'SELECT cohort_id AS "cohortId" FROM users WHERE id = $1',
      [req.userId],
    );
    if (cohortRows[0]?.cohortId) {
      markDeleted(cohortRows[0].cohortId);
    }

    const { rows: memberRows } = await client.query(
      'SELECT id FROM users WHERE household_id = (SELECT household_id FROM users WHERE id = $1)',
      [req.userId],
    );

    if (memberRows.length <= 1) {
      // Last member — wipe all household data
      await client.query(
        `DELETE FROM events WHERE household_id = (SELECT household_id FROM users WHERE id = $1)`,
        [req.userId],
      );
      await client.query(
        `DELETE FROM babies WHERE household_id = (SELECT household_id FROM users WHERE id = $1)`,
        [req.userId],
      );
    }

    await client.query('DELETE FROM users WHERE id = $1', [req.userId]);
    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
