import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// Keep in sync with EventType / EVENT_TYPES in packages/core/src/types/index.ts
const VALID_EVENT_TYPES = new Set([
  'bottle',
  'nursing',
  'nap',
  'sleep',
  'diaper',
  'medicine',
  'food',
  'milestone',
]);

// For SELECT/UPDATE with table alias e
const EVENT_COLS = `
  e.id,
  e.baby_id     AS "babyId",
  e.type,
  e.value,
  e.unit,
  e.notes,
  e.started_at  AS "startedAt",
  e.ended_at    AS "endedAt",
  e.created_at  AS "createdAt",
  e.updated_at  AS "updatedAt",
  e.deleted_at  AS "deletedAt",
  (SELECT u.display_name FROM users u WHERE u.id = e.logged_by) AS "loggedByName"
`;

// For INSERT RETURNING (no table alias)
const INSERT_RETURNING = `
  id,
  baby_id     AS "babyId",
  type,
  value,
  unit,
  notes,
  started_at  AS "startedAt",
  ended_at    AS "endedAt",
  created_at  AS "createdAt",
  updated_at  AS "updatedAt",
  (SELECT display_name FROM users WHERE id = logged_by) AS "loggedByName"
`;

// GET /events?since=ISO — delta sync
router.get('/', async (req: AuthRequest, res) => {
  const since = req.query.since as string | undefined;
  const { rows } = await pool.query(
    `SELECT ${EVENT_COLS}
     FROM events e
     JOIN babies b ON b.id = e.baby_id
     WHERE b.household_id = $1
       AND ($2::timestamptz IS NULL OR GREATEST(e.created_at, e.updated_at) > $2::timestamptz)
       AND ($2::timestamptz IS NOT NULL OR e.deleted_at IS NULL)
     ORDER BY e.started_at DESC
     LIMIT 200`,
    [req.householdId, since ?? null],
  );
  res.json(rows);
});

// POST /events — log a new event
router.post('/', async (req: AuthRequest, res) => {
  const { babyId, type, value, unit, notes, startedAt, endedAt } = req.body as {
    babyId: string;
    type: string;
    value?: number;
    unit?: string;
    notes?: string;
    startedAt?: string;
    endedAt?: string;
  };
  if (!babyId || !type) {
    res.status(400).json({ message: 'babyId and type are required' });
    return;
  }
  if (!VALID_EVENT_TYPES.has(type)) {
    res.status(400).json({ message: `type must be one of: ${[...VALID_EVENT_TYPES].join(', ')}` });
    return;
  }
  const { rowCount } = await pool.query('SELECT 1 FROM babies WHERE id=$1 AND household_id=$2', [
    babyId,
    req.householdId,
  ]);
  if (!rowCount) {
    res.status(403).json({ message: 'Baby not found' });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO events (baby_id, type, value, unit, notes, started_at, ended_at, logged_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${INSERT_RETURNING}`,
    [
      babyId,
      type,
      value ?? null,
      unit ?? null,
      notes ?? null,
      startedAt ?? new Date().toISOString(),
      endedAt ?? null,
      req.userId ?? null,
    ],
  );
  res.status(201).json(rows[0]);
});

// PATCH /events/:id — update event fields; only provided keys are written, null clears the field
router.patch('/:id', async (req: AuthRequest, res) => {
  const ALLOWED = ['endedAt', 'notes', 'value', 'unit', 'startedAt'] as const;
  const COL: Record<string, string> = {
    endedAt: 'ended_at',
    notes: 'notes',
    value: 'value',
    unit: 'unit',
    startedAt: 'started_at',
  };
  const updates = ALLOWED.filter(k => k in req.body);
  if (!updates.length) {
    res.status(400).json({ message: 'No fields to update' });
    return;
  }
  const params: unknown[] = [req.params.id, req.householdId];
  const setClauses = updates.map((k, i) => {
    params.push((req.body as Record<string, unknown>)[k] ?? null);
    return `${COL[k]} = $${i + 3}`;
  });
  const { rows, rowCount } = await pool.query(
    `UPDATE events e
     SET ${setClauses.join(', ')}
     FROM babies b
     WHERE e.id = $1 AND e.baby_id = b.id AND b.household_id = $2
     RETURNING ${EVENT_COLS}`,
    params,
  );
  if (!rowCount) {
    res.status(404).json({ message: 'Event not found' });
    return;
  }
  res.json(rows[0]);
});

// DELETE /events — admin only: clear ALL events for the household
router.delete('/', requireAdmin, async (req: AuthRequest, res) => {
  await pool.query(
    'DELETE FROM events e USING babies b WHERE e.baby_id = b.id AND b.household_id = $1',
    [req.householdId],
  );
  res.status(204).send();
});

// DELETE /events/:id — soft delete so other devices sync the removal
router.delete('/:id', async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query(
    `UPDATE events e SET deleted_at = NOW()
     FROM babies b WHERE e.id=$1 AND e.baby_id=b.id AND b.household_id=$2
       AND e.deleted_at IS NULL`,
    [req.params.id, req.householdId],
  );
  if (!rowCount) {
    res.status(404).json({ message: 'Event not found' });
    return;
  }
  res.status(204).send();
});

export default router;
