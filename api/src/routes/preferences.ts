/** GET /api/preferences and PUT /api/preferences — household-level settings sync. */
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const VALID_PREF_KEYS = new Set([
  'resetHour',
  'napCheckMinutes',
  'bedtimeHour',
  'wakeHour',
  'sleepTraining',
  'twinSync',
  'diaperNotifications',
  'bottleNotifications',
]);
const HOUR_KEYS = new Set(['resetHour', 'bedtimeHour', 'wakeHour']);
const BOOLEAN_KEYS = new Set([
  'sleepTraining',
  'twinSync',
  'diaperNotifications',
  'bottleNotifications',
]);

function validatePrefs(body: Record<string, unknown>): { message: string } | null {
  for (const key of Object.keys(body)) {
    if (!VALID_PREF_KEYS.has(key)) {
      return { message: `Unknown preference key: ${key}` };
    }
  }
  for (const key of HOUR_KEYS) {
    if (
      key in body &&
      (typeof body[key] !== 'number' || (body[key] as number) < 0 || (body[key] as number) > 23)
    ) {
      return { message: `${key} must be a number between 0 and 23` };
    }
  }
  if (
    'napCheckMinutes' in body &&
    (typeof body.napCheckMinutes !== 'number' || (body.napCheckMinutes as number) < 1)
  ) {
    return { message: 'napCheckMinutes must be a positive number' };
  }
  for (const key of BOOLEAN_KEYS) {
    if (key in body && typeof body[key] !== 'boolean') {
      return { message: `${key} must be a boolean` };
    }
  }
  return null;
}

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT data FROM household_preferences WHERE household_id = $1',
    [req.householdId],
  );
  res.json(rows[0]?.data ?? {});
});

router.put('/', async (req: AuthRequest, res) => {
  const prefError = validatePrefs(req.body as Record<string, unknown>);
  if (prefError) {
    res.status(400).json(prefError);
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO household_preferences (household_id, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (household_id) DO UPDATE
       SET data = $2, updated_at = NOW()
     RETURNING data`,
    [req.householdId, JSON.stringify(req.body)],
  );
  res.json(rows[0].data);
});

export default router;
