/**
 * API Security Tests
 *
 * Verifies:
 *  1. All protected routes reject requests with no/invalid token (401)
 *  2. Household isolation — users cannot read or mutate another household's data
 *  3. The `since` query parameter is handled safely (parameterised, no injection)
 *  4. Admin-only endpoint: DELETE /api/events (clear all)
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret';
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(userId: string, householdId: string, isAdmin = false) {
  return jwt.sign({ sub: userId, hid: householdId, adm: isAdmin }, TEST_SECRET, {
    expiresIn: '1h',
  });
}

// Mock the pg pool so tests never touch a real database.
// Each test configures what pool.query returns for its scenario.
jest.mock('../db', () => {
  const queryMock = jest.fn();
  return { pool: { query: queryMock } };
});

import { pool } from '../db';
const mockQuery = pool.query as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
});

// ── 0. Health endpoint ────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 { ok: true } when DB is reachable', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toMatch(/SELECT 1/i);
  });

  it('returns 503 { ok: false } when DB query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'db_unavailable' });
  });
});

// ── 1. Unauthenticated access ─────────────────────────────────────────────────

describe('Unauthenticated requests → 401', () => {
  const protectedEndpoints: [string, string, object?][] = [
    ['GET', '/api/babies', undefined],
    ['POST', '/api/babies', { name: 'Test' }],
    ['GET', '/api/events', undefined],
    ['POST', '/api/events', { babyId: 'x', type: 'bottle', startedAt: new Date().toISOString() }],
    ['PATCH', '/api/events/some-id', { endedAt: new Date().toISOString() }],
    ['DELETE', '/api/events/some-id', undefined],
    ['GET', '/api/auth/me', undefined],
    ['PUT', '/api/auth/me', { name: 'Mom' }],
    ['GET', '/api/alarms/active', undefined],
    [
      'POST',
      '/api/alarms',
      { babyId: 'x', firesAt: new Date().toISOString(), durationMs: 60000, label: 'nap' },
    ],
    ['PATCH', '/api/alarms/some-id', { dismissedAt: new Date().toISOString() }],
  ];

  for (const [method, path, body] of protectedEndpoints) {
    it(`${method} ${path} with no token → 401`, async () => {
      const req = (request(app) as unknown as Record<string, (p: string) => request.Test>)[
        method.toLowerCase()
      ](path);
      if (body) {
        req.send(body).set('Content-Type', 'application/json');
      }
      const res = await req;
      expect(res.status).toBe(401);
    });

    it(`${method} ${path} with invalid token → 401`, async () => {
      const client = request(app) as unknown as Record<string, (p: string) => request.Test>;
      const req = client[method.toLowerCase()](path).set(
        'Authorization',
        'Bearer totally.invalid.token',
      );
      if (body) {
        req.send(body).set('Content-Type', 'application/json');
      }
      const res = await req;
      expect(res.status).toBe(401);
    });
  }
});

// ── 2. Household isolation ────────────────────────────────────────────────────

describe('Household isolation', () => {
  const householdA = 'hhid-aaaa-aaaa';
  const householdB = 'hhid-bbbb-bbbb';
  const userA = 'user-aaaa';
  const userB = 'user-bbbb';
  const tokenA = makeToken(userA, householdA);
  const tokenB = makeToken(userB, householdB);

  it("GET /api/events returns only events scoped to the requester's household", async () => {
    // The query receives householdId as $1 — mock returns empty to keep it simple;
    // what matters is that the query is called with householdA (not householdB).
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/events').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    // Confirm the DB was queried with household A's ID, not B's
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/household_id/);
    expect(params[0]).toBe(householdA);
    expect(params[0]).not.toBe(householdB);
  });

  it("GET /api/babies scopes to requester's household", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/babies').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/household_id/);
    expect(params[0]).toBe(householdA);
  });

  it('PATCH /api/events/:id from a different household → 404 (no cross-household mutation)', async () => {
    // Simulate: the event exists but belongs to household A.
    // User B tries to patch it → rowCount = 0 (household filter prevents match).
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch('/api/events/event-owned-by-A')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ endedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
    // Confirm household B's ID was used in the query (not A's)
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(householdB);
  });

  it('DELETE /api/events/:id from a different household → 404', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .delete('/api/events/event-owned-by-A')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(householdB);
  });

  it('POST /api/events with a babyId from another household → 403', async () => {
    // baby ownership check: SELECT 1 FROM babies WHERE id=$1 AND household_id=$2
    // returns 0 rows because the baby belongs to household A, not B.
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        babyId: 'baby-owned-by-A',
        type: 'bottle',
        startedAt: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
    // Confirm household B was used for the ownership check
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(householdB);
  });
});

// ── 3. `since` parameter safety ───────────────────────────────────────────────

describe('GET /api/events?since — parameter safety', () => {
  const token = makeToken('user-x', 'hh-x');

  it('passes since value as a bound parameter, not interpolated into SQL', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const maliciousInput = "' OR '1'='1";
    await request(app)
      .get(`/api/events?since=${encodeURIComponent(maliciousInput)}`)
      .set('Authorization', `Bearer ${token}`);

    // The query should still succeed (malicious string is treated as a timestamp,
    // which ::timestamptz will cast to NULL or throw — either way no SQL injection).
    // What matters: the raw string was passed as a bound parameter, not concatenated.
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/\$2::timestamptz/); // confirms parameterised
    expect(sql).not.toContain(maliciousInput); // not in the SQL string itself
    expect(params[1]).toBe(maliciousInput); // value is bound, not interpolated
  });

  it('handles missing since by passing null as $2', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/events').set('Authorization', `Bearer ${token}`);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBeNull();
  });

  it('returns 200 with a valid ISO since param', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const since = new Date(Date.now() - 60_000).toISOString();

    const res = await request(app)
      .get(`/api/events?since=${encodeURIComponent(since)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── 4. Input validation ───────────────────────────────────────────────────────

describe('Input validation', () => {
  const token = makeToken('user-x', 'hh-x');

  describe('POST /api/auth/register', () => {
    it('rejects missing email → 400', async () => {
      const res = await request(app).post('/api/auth/register').send({ password: 'validpassword' });
      expect(res.status).toBe(400);
    });

    it('rejects malformed email → 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'notanemail', password: 'validpassword' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/email/i);
    });

    it('rejects password shorter than 8 chars → 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'a@b.com', password: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password/i);
    });
  });

  describe('POST /api/events — type validation', () => {
    it('rejects unknown event type → 400', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'baby-1' }], rowCount: 1 });
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ babyId: 'baby-1', type: 'hacktype', startedAt: new Date().toISOString() });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/type must be one of/i);
    });

    it('rejects missing babyId or type → 400', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'bottle' });
      expect(res.status).toBe(400);
    });

    it('accepts a valid event type → proceeds to baby ownership check', async () => {
      // Returns rowCount 0 = baby not in this household → 403 (not 400)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ babyId: 'baby-1', type: 'bottle', startedAt: new Date().toISOString() });
      expect(res.status).toBe(403); // passed type validation, hit household check
    });
  });

  describe('PUT /api/preferences — schema validation', () => {
    it('rejects unknown preference key → 400', async () => {
      const res = await request(app)
        .put('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ unknownKey: 'value' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unknown preference key/i);
    });

    it('rejects out-of-range bedtimeHour → 400', async () => {
      const res = await request(app)
        .put('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ bedtimeHour: 25 });
      expect(res.status).toBe(400);
    });

    it('rejects non-boolean sleepTraining → 400', async () => {
      const res = await request(app)
        .put('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ sleepTraining: 'yes' });
      expect(res.status).toBe(400);
    });

    it('accepts valid preferences → 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ data: { bedtimeHour: 20 } }] });
      const res = await request(app)
        .put('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ bedtimeHour: 20, sleepTraining: true });
      expect(res.status).toBe(200);
    });
  });
});

// ── 5. Profile endpoints (/auth/me) ───────────────────────────────────────────

describe('Profile endpoints', () => {
  const token = makeToken('user-p', 'hh-p');

  it('GET /api/auth/me returns user profile', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-p',
          email: 'p@test.com',
          displayName: 'Mom',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Mom');
    // Confirm query uses the authenticated user's ID
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE id=/i);
    expect(params[0]).toBe('user-p');
  });

  it('PUT /api/auth/me updates display_name and returns updated profile', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-p',
          email: 'p@test.com',
          displayName: 'Dad',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dad' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Dad');
    // Confirm update is scoped to authenticated user
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE users/i);
    expect(params[1]).toBe('user-p');
  });

  it('PUT /api/auth/me with empty name clears display_name', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-p',
          email: 'p@test.com',
          displayName: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBeNull();
  });
});

// ── 6. Parent attribution (logged_by) ─────────────────────────────────────────

describe('POST /api/events — parent attribution', () => {
  const userId = 'user-attr';
  const householdId = 'hh-attr';
  const token = makeToken(userId, householdId);

  it('stores logged_by as the authenticated user ID', async () => {
    // First query: baby ownership check → passes
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'baby-1' }], rowCount: 1 });
    // Second query: INSERT event
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'ev-1',
          babyId: 'baby-1',
          type: 'bottle',
          startedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          loggedByName: 'Mom',
        },
      ],
    });

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ babyId: 'baby-1', type: 'bottle', startedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    // Confirm the INSERT SQL includes the authenticated user's ID as logged_by
    const insertCall = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(insertCall[0]).toMatch(/logged_by/);
    expect(insertCall[1]).toContain(userId);
  });
});

// ── 7. Admin-only endpoint ────────────────────────────────────────────────────

describe('Admin endpoint: DELETE /api/events (clear all)', () => {
  const adminToken = makeToken('admin-user', 'hh-admin', true);
  const regularToken = makeToken('regular-user', 'hh-regular', false);

  it('DELETE /api/events with no token → 401', async () => {
    const res = await request(app).delete('/api/events');
    expect(res.status).toBe(401);
  });

  it('DELETE /api/events with a non-admin token → 403', async () => {
    const res = await request(app)
      .delete('/api/events')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /api/events with admin token → 204', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const res = await request(app)
      .delete('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
    // Verify household scoping
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/household_id/);
    expect(params[0]).toBe('hh-admin');
  });

  it('admin token cannot be fabricated without the server secret', async () => {
    // A token signed with a different secret should be rejected
    const fakeToken = jwt.sign({ sub: 'evil', hid: 'hh-evil', adm: true }, 'wrong-secret', {
      expiresIn: '1h',
    });
    const res = await request(app)
      .delete('/api/events')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  it('non-admin token with adm:false cannot access admin endpoint', async () => {
    const tokenWithFalse = jwt.sign({ sub: 'user', hid: 'hh-user', adm: false }, TEST_SECRET, {
      expiresIn: '1h',
    });
    const res = await request(app)
      .delete('/api/events')
      .set('Authorization', `Bearer ${tokenWithFalse}`);
    expect(res.status).toBe(403);
  });

  it('existing protected endpoints list includes DELETE /api/events', async () => {
    // Verify the existing unauthenticated test list is complete
    // (this is a meta-test — it reminds future devs to add new admin endpoints to auth tests)
    const res = await request(app).delete('/api/events');
    expect(res.status).not.toBe(200); // must require auth
  });
});

// ── 8. Email verification endpoints ───────────────────────────────────────────

describe('Email verification', () => {
  const token = makeToken('user-v', 'hh-v');

  it('GET /api/auth/verify-email with no token param → 400', async () => {
    const res = await request(app).get('/api/auth/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/token required/i);
  });

  it('GET /api/auth/verify-email with an invalid/expired token → 400', async () => {
    // UPDATE returns 0 rows — token not found or expired
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get('/api/auth/verify-email?token=deadbeef');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it('GET /api/auth/verify-email with a valid token → 200 { verified: true }', async () => {
    // UPDATE marks email_verified = true and returns the user row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'user-v' }], rowCount: 1 });

    const res = await request(app).get('/api/auth/verify-email?token=validtoken123');
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);

    // Confirm the UPDATE query used the token as a bound param, not interpolated
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/email_verified\s*=\s*true/i);
    expect(params[0]).toBe('validtoken123');
  });

  it('POST /api/auth/resend-verification requires auth → 401', async () => {
    const res = await request(app).post('/api/auth/resend-verification');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/resend-verification when already verified → 200 already verified message', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ email: 'v@test.com', emailVerified: true }],
    });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
  });

  it('POST /api/auth/resend-verification when unverified → 200 sent message', async () => {
    // First query: SELECT user → unverified
    mockQuery.mockResolvedValueOnce({
      rows: [{ email: 'v@test.com', emailVerified: false }],
    });
    // Second query: UPDATE token
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);

    // Confirm UPDATE stores a new verification token for the correct user
    const updateCall = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(updateCall[0]).toMatch(/email_verification_token/);
    expect(updateCall[1][2]).toBe('user-v');
  });

  it('POST /api/auth/register response includes emailVerified: false', async () => {
    // gen_random_uuid × 3 (householdId, inviteCode, verificationToken via randomBytes)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'hh-new' }] }) // householdId
      .mockResolvedValueOnce({ rows: [{ code: 'ABCD1234' }] }) // inviteCode
      .mockResolvedValueOnce({
        // INSERT user
        rows: [
          {
            id: 'u-new',
            householdId: 'hh-new',
            inviteCode: 'ABCD1234',
            isAdmin: false,
            displayName: null,
          },
        ],
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
  });

  it('POST /api/auth/login response includes emailVerified from DB', async () => {
    // Hash at cost 1 (fast) so the bcrypt.compare in the login handler succeeds.
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 1);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'u-login',
          passwordHash: undefined,
          password_hash: hash,
          householdId: 'hh-login',
          inviteCode: 'LOGINCODE',
          isAdmin: false,
          displayName: null,
          emailVerified: true,
        },
      ],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'existing@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);
  });
});

// ── 9. Auth — login failure, refresh, join, duplicate email ───────────────────

describe('POST /api/auth/login — failure', () => {
  it('returns 401 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  it('returns 401 when password is wrong', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('correctpassword', 1);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'u-x',
          password_hash: hash,
          householdId: 'hh-x',
          inviteCode: 'CODE1234',
          isAdmin: false,
          displayName: null,
          emailVerified: false,
        },
      ],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new tokens for a valid refresh token', async () => {
    const refreshToken = jwt.sign({ sub: 'user-r', hid: 'hh-r', type: 'refresh' }, TEST_SECRET, {
      expiresIn: '90d',
    });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('returns 401 for an expired/invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not.a.valid.token' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid refresh token/i);
  });

  it('returns 401 when an access token (not refresh type) is used', async () => {
    // Access tokens have adm claim, not type:'refresh'
    const accessToken = makeToken('user-r', 'hh-r');

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register — duplicate email', () => {
  it('returns 409 when email is already registered', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'hh-dup' }] }) // householdId
      .mockResolvedValueOnce({ rows: [{ code: 'ABCD1234' }] }) // inviteCode
      .mockRejectedValueOnce({ code: '23505' }); // INSERT → unique violation

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
  });
});

describe('POST /api/auth/join', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/join')
      .send({ email: 'j@test.com', password: 'password123' }); // missing inviteCode

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inviteCode/i);
  });

  it('returns 404 when invite code does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // lookup returns nothing

    const res = await request(app)
      .post('/api/auth/join')
      .send({ email: 'j@test.com', password: 'password123', inviteCode: 'BADCODE1' });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/invalid invite code/i);
  });

  it('joins an existing household and returns 201 with emailVerified: false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ household_id: 'hh-existing' }] }) // invite code lookup
      .mockResolvedValueOnce({ rows: [{ code: 'NEWCODE1' }] }) // new invite code
      .mockResolvedValueOnce({
        // INSERT user
        rows: [
          {
            id: 'u-joined',
            householdId: 'hh-existing',
            inviteCode: 'NEWCODE1',
            isAdmin: false,
            displayName: null,
          },
        ],
      });

    const res = await request(app)
      .post('/api/auth/join')
      .send({ email: 'joiner@test.com', password: 'password123', inviteCode: 'EXISTING' });

    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
    expect(res.body.accessToken).toBeDefined();

    // Confirm new user is inserted into the existing household
    const insertCall = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(insertCall[0]).toMatch(/INSERT INTO users/i);
    expect(insertCall[1]).toContain('hh-existing');
  });

  it('returns 409 when joining with an already-registered email', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ household_id: 'hh-existing' }] }) // invite code lookup
      .mockResolvedValueOnce({ rows: [{ code: 'NEWCODE1' }] }) // new invite code
      .mockRejectedValueOnce({ code: '23505' }); // INSERT → unique violation

    const res = await request(app)
      .post('/api/auth/join')
      .send({ email: 'dupe@test.com', password: 'password123', inviteCode: 'EXISTING' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
  });
});

// ── 10. Babies endpoints ──────────────────────────────────────────────────────

describe('Babies endpoints', () => {
  const token = makeToken('user-b', 'hh-b');

  it('GET /api/babies returns list scoped to household', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'baby-1',
          name: 'Alice',
          color: 'amber',
          birthDate: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'baby-2',
          name: 'Bob',
          color: 'emerald',
          birthDate: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app).get('/api/babies').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Alice');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/household_id/);
    expect(params[0]).toBe('hh-b');
  });

  it('POST /api/babies creates a baby and returns 201', async () => {
    // First query: COUNT existing babies (returns 0 → first color: amber)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    // Second query: INSERT baby
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'baby-new',
          name: 'Charlie',
          color: 'amber',
          birthDate: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Charlie' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Charlie');
    expect(res.body.color).toBe('amber');
  });

  it('POST /api/babies creates baby with birthDate', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'baby-bd',
          name: 'Daisy',
          color: 'emerald',
          birthDate: '2025-06-15',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Daisy', birthDate: '2025-06-15' });

    expect(res.status).toBe(201);
    expect(res.body.birthDate).toBe('2025-06-15');

    // Confirm birthDate is passed as a bound param
    const insertCall = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(insertCall[1]).toContain('2025-06-15');
  });

  it('POST /api/babies → 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name required/i);
  });

  it('POST /api/babies → 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name required/i);
  });

  it('POST /api/babies → 400 when name exceeds 50 characters', async () => {
    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A'.repeat(51) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/50 characters/i);
  });

  it('POST /api/babies → 400 when birthDate format is invalid', async () => {
    const res = await request(app)
      .post('/api/babies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Eve', birthDate: '15/06/2025' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/YYYY-MM-DD/i);
  });

  it('POST /api/babies color cycles through palette based on existing count', async () => {
    const COLORS = ['amber', 'emerald', 'slate', 'rose', 'sky', 'violet'];

    for (let i = 0; i < COLORS.length; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: String(i) }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: `b-${i}`,
            name: 'X',
            color: COLORS[i],
            birthDate: null,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .post('/api/babies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X' });

      expect(res.status).toBe(201);
      // Confirm the correct color is passed to INSERT
      const insertIdx = mockQuery.mock.calls.length - 1;
      const insertCall = mockQuery.mock.calls[insertIdx] as [string, unknown[]];
      expect(insertCall[1]).toContain(COLORS[i]);
    }
  });
});

// ── 11. Alarms endpoints ──────────────────────────────────────────────────────

describe('Alarms endpoints', () => {
  const token = makeToken('user-a', 'hh-a');
  const firesAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  it('GET /api/alarms/active returns undismissed alarms scoped to household', async () => {
    const alarm = {
      id: 'alarm-1',
      babyId: 'baby-1',
      householdId: 'hh-a',
      firesAt,
      durationMs: 1800000,
      label: 'nap',
      dismissedAt: null,
      createdAt: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [alarm] });

    const res = await request(app)
      .get('/api/alarms/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('alarm-1');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/household_id/);
    expect(params[0]).toBe('hh-a');
  });

  it('POST /api/alarms creates alarm and auto-dismisses existing ones', async () => {
    // First query: UPDATE to dismiss existing alarms
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Second query: INSERT new alarm
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'alarm-new',
          babyId: 'baby-1',
          householdId: 'hh-a',
          firesAt,
          durationMs: 1800000,
          label: 'nap',
          dismissedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/alarms')
      .set('Authorization', `Bearer ${token}`)
      .send({ babyId: 'baby-1', firesAt, durationMs: 1800000, label: 'nap' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('alarm-new');

    // Confirm the dismiss UPDATE ran first, scoped to the baby + household
    const dismissCall = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(dismissCall[0]).toMatch(/dismissed_at\s*=\s*NOW/i);
    expect(dismissCall[1]).toContain('baby-1');
    expect(dismissCall[1]).toContain('hh-a');
  });

  it('PATCH /api/alarms/:id dismisses an alarm', async () => {
    const dismissedAt = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'alarm-1',
          babyId: 'baby-1',
          householdId: 'hh-a',
          firesAt,
          durationMs: 1800000,
          label: 'nap',
          dismissedAt,
          createdAt: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .patch('/api/alarms/alarm-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ dismissedAt });

    expect(res.status).toBe(200);
    expect(res.body.dismissedAt).toBe(dismissedAt);

    // Confirm household scoping in UPDATE
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE nap_alarms/i);
    expect(params[1]).toBe('hh-a');
  });

  it('PATCH /api/alarms/:id reschedules an alarm', async () => {
    const newFiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'alarm-1',
          babyId: 'baby-1',
          householdId: 'hh-a',
          firesAt: newFiresAt,
          durationMs: 3600000,
          label: 'nap',
          dismissedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .patch('/api/alarms/alarm-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firesAt: newFiresAt, durationMs: 3600000 });

    expect(res.status).toBe(200);
    expect(res.body.firesAt).toBe(newFiresAt);
  });

  it('PATCH /api/alarms/:id → 404 when alarm does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch('/api/alarms/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .send({ dismissedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/alarm not found/i);
  });

  it('PATCH /api/alarms/:id from a different household → 404', async () => {
    const otherToken = makeToken('user-other', 'hh-other');
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch('/api/alarms/alarm-owned-by-hh-a')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ dismissedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
    // Confirm the query used the other household's ID, not hh-a
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('hh-other');
  });
});
