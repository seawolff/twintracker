jest.mock('../db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../email', () => ({
  sendChildStageDigestEmail: jest.fn().mockResolvedValue(undefined),
}));

import { pool } from '../db';
import { sendChildStageDigestEmail } from '../email';
import { __childStageDigest, maybeSendDueChildStageDigests } from '../childStageDigest';

const mockQuery = pool.query as jest.Mock;
const mockSendChildStageDigestEmail = sendChildStageDigestEmail as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
  mockSendChildStageDigestEmail.mockClear();
});

describe('child stage digest helpers', () => {
  it('formats monthly and yearly age labels', () => {
    expect(__childStageDigest.formatAgeLabel(7)).toBe('7 months old');
    expect(__childStageDigest.formatAgeLabel(24)).toBe('2 years old');
  });

  it('computes whole months when birth dates arrive as Date objects', () => {
    expect(
      __childStageDigest.getWholeMonths(
        new Date('2025-09-15T00:00:00.000Z'),
        new Date('2026-04-29T12:00:00.000Z'),
      ),
    ).toBe(7);
  });

  it('builds a monthly stage digest after the first month', () => {
    const digest = __childStageDigest.buildStageDigest(7);
    expect(digest?.stageKey).toBe('month:7');
    expect(digest?.ageLabel).toBe('7 months old');
    expect(digest?.expectations.length).toBeGreaterThan(0);
    expect(digest?.milestoneCues.length).toBeGreaterThan(0);
  });

  it('summarizes recent trends from logged events', () => {
    const bullets = __childStageDigest.buildTrendBullets([
      {
        babyId: 'baby-1',
        type: 'bottle',
        value: 6,
        startedAt: '2026-04-25T08:00:00.000Z',
      },
      {
        babyId: 'baby-1',
        type: 'sleep',
        startedAt: '2026-04-24T19:00:00.000Z',
        endedAt: '2026-04-25T02:00:00.000Z',
      },
      {
        babyId: 'baby-1',
        type: 'diaper',
        notes: 'wet',
        startedAt: '2026-04-25T09:00:00.000Z',
      },
    ]);

    const combined = bullets.join(' ');
    expect(combined).toContain('feeds per day');
    expect(combined).toContain('longest night stretch');
  });

  it('uses recent milestone logs when they exist', () => {
    const stage = __childStageDigest.buildStageDigest(7)!;
    const bullets = __childStageDigest.buildMilestoneBullets(
      [
        {
          babyId: 'baby-1',
          type: 'milestone',
          notes: 'Rolled from back to belly',
          startedAt: '2026-04-25T09:00:00.000Z',
        },
      ],
      stage,
    );

    expect(bullets[0]).toContain('Rolled from back to belly');
  });
});

describe('maybeSendDueChildStageDigests', () => {
  it('emails verified active family members and skips guests', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'baby-1', name: 'George', birthDate: '2025-09-15' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'user-active', email: 'family@example.com', displayName: 'Chris' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            babyId: 'baby-1',
            type: 'bottle',
            value: 6,
            notes: null,
            startedAt: '2026-04-20T08:00:00.000Z',
            endedAt: null,
          },
          {
            babyId: 'baby-1',
            type: 'milestone',
            notes: 'Rolled from back to belly',
            startedAt: '2026-04-21T08:00:00.000Z',
            endedAt: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1' }] });

    await maybeSendDueChildStageDigests({
      householdId: 'household-1',
      locale: 'en',
      now: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(mockSendChildStageDigestEmail).toHaveBeenCalledTimes(1);
    expect(mockSendChildStageDigestEmail.mock.calls[0][0]).toMatchObject({
      email: 'family@example.com',
      recipientName: 'Chris',
      babyName: 'George',
      ageLabel: '7 months old',
    });
    expect(mockSendChildStageDigestEmail.mock.calls[0][0].milestoneBullets[0]).toContain(
      'Rolled from back to belly',
    );
  });

  it('does not send before one month old', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'baby-1', name: 'George', birthDate: '2026-04-10' }],
    });

    await maybeSendDueChildStageDigests({
      householdId: 'household-1',
      locale: 'en',
      now: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(mockSendChildStageDigestEmail).not.toHaveBeenCalled();
  });
});
