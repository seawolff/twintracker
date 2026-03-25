/** Nap alarm routes — server-side timers that sync fire + dismiss across all devices. */
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const COLS = `
  id,
  baby_id      AS "babyId",
  household_id AS "householdId",
  fires_at     AS "firesAt",
  duration_ms  AS "durationMs",
  label,
  dismissed_at AS "dismissedAt",
  created_at   AS "createdAt"
`;

// GET /api/alarms/active — undismissed alarms that haven't fired more than 30s ago
// (30s grace handles slight clock drift between devices)
router.get('/active', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM nap_alarms
     WHERE household_id = $1
       AND dismissed_at IS NULL
       AND fires_at > NOW() - INTERVAL '30 seconds'
     ORDER BY fires_at ASC`,
    [req.householdId],
  );
  res.json(rows);
});

// POST /api/alarms — create alarm, auto-dismissing any existing alarm for the same baby
router.post('/', async (req: AuthRequest, res) => {
  const { babyId, firesAt, durationMs, label } = req.body as {
    babyId: string;
    firesAt: string;
    durationMs: number;
    label: string;
  };

  // Dismiss any existing active alarm for this baby first (one alarm per baby)
  await pool.query(
    `UPDATE nap_alarms
     SET dismissed_at = NOW()
     WHERE baby_id = $1 AND household_id = $2 AND dismissed_at IS NULL`,
    [babyId, req.householdId],
  );

  const { rows } = await pool.query(
    `INSERT INTO nap_alarms (baby_id, household_id, fires_at, duration_ms, label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [babyId, req.householdId, firesAt, durationMs, label],
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/alarms/:id — dismiss or reschedule
router.patch('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { dismissedAt, firesAt, durationMs } = req.body as {
    dismissedAt?: string;
    firesAt?: string;
    durationMs?: number;
  };

  const { rows, rowCount } = await pool.query(
    `UPDATE nap_alarms
     SET dismissed_at = COALESCE($3, dismissed_at),
         fires_at     = COALESCE($4::timestamptz, fires_at),
         duration_ms  = COALESCE($5, duration_ms)
     WHERE id = $1 AND household_id = $2
     RETURNING ${COLS}`,
    [id, req.householdId, dismissedAt ?? null, firesAt ?? null, durationMs ?? null],
  );

  if (!rowCount) {
    res.status(404).json({ message: 'Alarm not found' });
    return;
  }
  res.json(rows[0]);
});

export default router;
