import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const COLORS = ['amber', 'emerald', 'slate', 'rose', 'sky', 'violet'] as const;
const VALID_SEX = ['male', 'female'] as const;

/** Returns true when a YYYY-MM-DD date string is strictly after today's date. */
function isFutureDate(date: string): boolean {
  return date > new Date().toISOString().split('T')[0];
}

/**
 * Validates optional baby fields shared by POST and PATCH.
 * Returns an error message string, or null if all fields are valid.
 * `allowNull` should be true for PATCH (fields can be explicitly cleared).
 */
function validateBabyFields(fields: {
  birthDate?: string | null;
  adjustedBirthDate?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  sex?: string | null;
  allowNull?: boolean;
}): string | null {
  const { birthDate, adjustedBirthDate, weightKg, heightCm, sex, allowNull = false } = fields;
  const birthDatePresent = allowNull
    ? birthDate !== undefined && birthDate !== null
    : birthDate !== undefined;
  const adjPresent = allowNull
    ? adjustedBirthDate !== undefined && adjustedBirthDate !== null
    : adjustedBirthDate !== undefined;

  if (birthDatePresent && typeof birthDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return 'birthDate must be YYYY-MM-DD';
  }
  if (birthDatePresent && typeof birthDate === 'string' && isFutureDate(birthDate)) {
    return 'birthDate cannot be in the future';
  }
  if (
    adjPresent &&
    typeof adjustedBirthDate === 'string' &&
    !/^\d{4}-\d{2}-\d{2}$/.test(adjustedBirthDate)
  ) {
    return 'adjustedBirthDate must be YYYY-MM-DD';
  }
  if (adjPresent && typeof adjustedBirthDate === 'string' && isFutureDate(adjustedBirthDate)) {
    return 'adjustedBirthDate cannot be in the future';
  }
  if (
    weightKg !== undefined &&
    weightKg !== null &&
    (typeof weightKg !== 'number' || weightKg <= 0 || weightKg > 100)
  ) {
    return 'weightKg must be a positive number ≤ 100';
  }
  if (
    heightCm !== undefined &&
    heightCm !== null &&
    (typeof heightCm !== 'number' || heightCm <= 0 || heightCm > 300)
  ) {
    return 'heightCm must be a positive number ≤ 300';
  }
  if (sex !== undefined && sex !== null && !(VALID_SEX as readonly string[]).includes(sex)) {
    return 'sex must be "male" or "female"';
  }
  return null;
}

/** Columns returned by every baby query. */
const BABY_RETURNING = `
  id, name, color,
  birth_date           AS "birthDate",
  adjusted_birth_date  AS "adjustedBirthDate",
  weight_kg            AS "weightKg",
  height_cm            AS "heightCm",
  sex,
  created_at           AS "createdAt"
`;

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT ${BABY_RETURNING}
     FROM babies WHERE household_id=$1 ORDER BY created_at`,
    [req.householdId],
  );
  res.json(rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const { name, birthDate, adjustedBirthDate, weightKg, heightCm, sex } = req.body as {
    name: string;
    birthDate?: string;
    adjustedBirthDate?: string | null;
    weightKg?: number | null;
    heightCm?: number | null;
    sex?: string | null;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ message: 'name required' });
    return;
  }
  if (name.trim().length > 50) {
    res.status(400).json({ message: 'name must be 50 characters or fewer' });
    return;
  }
  const fieldError = validateBabyFields({ birthDate, adjustedBirthDate, weightKg, heightCm, sex });
  if (fieldError) {
    res.status(400).json({ message: fieldError });
    return;
  }

  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM babies WHERE household_id=$1', [
    req.householdId,
  ]);
  const color = COLORS[Number(existing[0].count) % COLORS.length];
  const { rows } = await pool.query(
    `INSERT INTO babies (user_id, household_id, name, color, birth_date, adjusted_birth_date, weight_kg, height_cm, sex)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${BABY_RETURNING}`,
    [
      req.userId,
      req.householdId,
      name,
      color,
      birthDate ?? null,
      adjustedBirthDate ?? null,
      weightKg ?? null,
      heightCm ?? null,
      sex ?? null,
    ],
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, birthDate, adjustedBirthDate, weightKg, heightCm, sex } = req.body as {
    name?: string;
    birthDate?: string | null;
    adjustedBirthDate?: string | null;
    weightKg?: number | null;
    heightCm?: number | null;
    sex?: string | null;
  };

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'name must be a non-empty string' });
      return;
    }
    if (name.trim().length > 50) {
      res.status(400).json({ message: 'name must be 50 characters or fewer' });
      return;
    }
  }
  const fieldError = validateBabyFields({
    birthDate,
    adjustedBirthDate,
    weightKg,
    heightCm,
    sex,
    allowNull: true,
  });
  if (fieldError) {
    res.status(400).json({ message: fieldError });
    return;
  }

  // Build SET clause dynamically — only update provided fields
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name.trim());
  }
  if (birthDate !== undefined) {
    updates.push(`birth_date = $${idx++}`);
    values.push(birthDate ?? null);
  }
  if (adjustedBirthDate !== undefined) {
    updates.push(`adjusted_birth_date = $${idx++}`);
    values.push(adjustedBirthDate ?? null);
  }
  if (weightKg !== undefined) {
    updates.push(`weight_kg = $${idx++}`);
    values.push(weightKg);
  }
  if (heightCm !== undefined) {
    updates.push(`height_cm = $${idx++}`);
    values.push(heightCm);
  }
  if (sex !== undefined) {
    updates.push(`sex = $${idx++}`);
    values.push(sex);
  }

  if (updates.length === 0) {
    res.status(400).json({ message: 'No fields to update' });
    return;
  }

  values.push(id, req.householdId);
  const { rows } = await pool.query(
    `UPDATE babies SET ${updates.join(', ')}
     WHERE id = $${idx} AND household_id = $${idx + 1}
     RETURNING ${BABY_RETURNING}`,
    values,
  );

  if (rows.length === 0) {
    res.status(404).json({ message: 'Baby not found' });
    return;
  }

  res.json(rows[0]);
});

export default router;
