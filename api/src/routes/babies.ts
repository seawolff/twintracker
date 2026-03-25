import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const COLORS = ['amber', 'emerald', 'slate', 'rose', 'sky', 'violet'] as const;

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, color, birth_date AS "birthDate", created_at AS "createdAt"
     FROM babies WHERE household_id=$1 ORDER BY created_at`,
    [req.householdId],
  );
  res.json(rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const { name, birthDate } = req.body as { name: string; birthDate?: string };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ message: 'name required' });
    return;
  }
  if (name.trim().length > 50) {
    res.status(400).json({ message: 'name must be 50 characters or fewer' });
    return;
  }
  if (birthDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.status(400).json({ message: 'birthDate must be YYYY-MM-DD' });
    return;
  }
  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM babies WHERE household_id=$1', [
    req.householdId,
  ]);
  const color = COLORS[Number(existing[0].count) % COLORS.length];
  const { rows } = await pool.query(
    `INSERT INTO babies (user_id, household_id, name, color, birth_date)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, color, birth_date AS "birthDate", created_at AS "createdAt"`,
    [req.userId, req.householdId, name, color, birthDate ?? null],
  );
  res.status(201).json(rows[0]);
});

export default router;
