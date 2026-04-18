import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLATFORMS = new Set(['ios', 'android', 'both']);

// POST /api/waitlist — unauthenticated; stores email + platform interest for pre-launch list.
// Silently succeeds on duplicate email (idempotent).
router.post('/', async (req, res) => {
  const { email, platform, source, utmSource, utmMedium, utmCampaign } = req.body as {
    email?: string;
    platform?: string;
    source?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ message: 'Valid email required' });
    return;
  }

  const cleanPlatform = platform && VALID_PLATFORMS.has(platform) ? platform : null;
  const cleanSource = typeof source === 'string' && source.trim() ? source.trim() : 'landing';
  const cleanUtmSource = utmSource?.trim() || null;
  const cleanUtmMedium = utmMedium?.trim() || null;
  const cleanUtmCampaign = utmCampaign?.trim() || null;

  try {
    await pool.query(
      `INSERT INTO waitlist (email, platform, source, utm_source, utm_medium, utm_campaign)
       VALUES (lower($1), $2, $3, $4, $5, $6)
       ON CONFLICT (lower(email)) DO NOTHING`,
      [email, cleanPlatform, cleanSource, cleanUtmSource, cleanUtmMedium, cleanUtmCampaign],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('waitlist insert error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/waitlist/export — admin only; returns CSV of all waitlist entries
router.get('/export', requireAuth, async (req: AuthRequest, res) => {
  const { rows: adminCheck } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [
    req.userId,
  ]);
  if (!adminCheck[0]?.is_admin) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }

  const { rows } = await pool.query(
    `SELECT email, platform, source, utm_source, utm_medium, utm_campaign, created_at
     FROM waitlist
     ORDER BY created_at DESC`,
  );

  const header = 'email,platform,source,utm_source,utm_medium,utm_campaign,created_at\n';
  const csv =
    header +
    rows
      .map(r =>
        [
          r.email,
          r.platform ?? '',
          r.source,
          r.utm_source ?? '',
          r.utm_medium ?? '',
          r.utm_campaign ?? '',
          r.created_at,
        ]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
  res.send(csv);
});

export default router;
