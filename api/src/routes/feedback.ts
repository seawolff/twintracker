import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const FEEDBACK_MAX_MESSAGE_LENGTH = 2000;
const FEEDBACK_MIN_RATING = 1;
const FEEDBACK_MAX_RATING = 5;

const router = Router();

// POST /api/feedback — authenticated; stores a 1–5 rating + optional message.
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { rating, message } = req.body as { rating?: unknown; message?: unknown };

  const r = Number(rating);
  if (!Number.isInteger(r) || r < FEEDBACK_MIN_RATING || r > FEEDBACK_MAX_RATING) {
    res
      .status(400)
      .json({ message: `rating must be an integer ${FEEDBACK_MIN_RATING}–${FEEDBACK_MAX_RATING}` });
    return;
  }

  const cleanMessage =
    typeof message === 'string' && message.trim()
      ? message.trim().slice(0, FEEDBACK_MAX_MESSAGE_LENGTH)
      : null;

  try {
    await pool.query(`INSERT INTO feedback (user_id, rating, message) VALUES ($1, $2, $3)`, [
      req.userId,
      r,
      cleanMessage,
    ]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('feedback insert error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
