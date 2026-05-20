/**
 * Feedback endpoint tests — end-to-end coverage for POST /api/feedback.
 *
 * Verifies:
 *  1. Unauthenticated requests are rejected (401)
 *  2. Valid 1–5 ratings are accepted and stored with the user id
 *  3. An optional message is stored when provided
 *  4. An empty/whitespace message is stored as null
 *  5. A message over 2000 chars is truncated to 2000
 *  6. Out-of-range and non-integer ratings are rejected (400)
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

const TEST_SECRET = 'test-secret';
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(userId: string, householdId = 'hh-1') {
  return jwt.sign({ sub: userId, hid: householdId }, TEST_SECRET, { expiresIn: '1h' });
}

jest.mock('../db', () => {
  const queryMock = jest.fn();
  return { pool: { query: queryMock } };
});

import { pool } from '../db';
const mockQuery = pool.query as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

const token = makeToken('user-1');

describe('POST /api/feedback — auth', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/feedback').send({ rating: 4 });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', 'Bearer bad.token.here')
      .send({ rating: 4 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/feedback — valid submissions', () => {
  it('accepts each rating value 1–5 and returns { ok: true }', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
    }
  });

  it('stores the user id and rating in the feedback table', async () => {
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO feedback/i);
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe(5);
  });

  it('stores a provided message', async () => {
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3, message: 'Love the sleep tracking!' });

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('Love the sleep tracking!');
  });

  it('stores null when message is empty', async () => {
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3, message: '   ' });

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });

  it('stores null when message is omitted', async () => {
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 2 });

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });

  it('truncates messages longer than 2000 chars', async () => {
    const long = 'x'.repeat(2500);
    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, message: long });

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect((params[2] as string).length).toBe(2000);
  });
});

describe('POST /api/feedback — invalid ratings', () => {
  const cases = [
    { label: 'rating 0', body: { rating: 0 } },
    { label: 'rating 6', body: { rating: 6 } },
    { label: 'rating -1', body: { rating: -1 } },
    { label: 'non-integer 3.5', body: { rating: 3.5 } },
    { label: 'string rating', body: { rating: 'great' } },
    { label: 'missing rating', body: {} },
  ];

  for (const { label, body } of cases) {
    it(`rejects ${label} with 400`, async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  }
});
