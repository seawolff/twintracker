import PDFDocument from 'pdfkit';
import path from 'path';
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth';

// Font / asset paths — resolved relative to this file so they work in both
// dev (api/src/routes/) and the compiled prod build (api/dist/routes/).
// Files live in api/src/assets/ and are committed to the api workspace so
// they're always available regardless of monorepo build context.
const ASSETS_DIR = path.resolve(__dirname, '../assets');
const FONT_NUNITO = path.join(ASSETS_DIR, 'Nunito-wght.ttf');
const FONT_DM_MONO = path.join(ASSETS_DIR, 'DMMono-Regular.ttf');
const FONT_DM_MONO_MEDIUM = path.join(ASSETS_DIR, 'DMMono-Medium.ttf');
const LOGO_PATH = path.join(ASSETS_DIR, 'icon-192.png');
type TimeFormat = '12h' | '24h';

const router = Router();
router.use(requireAuth);

function formatExportTime(date: Date, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

async function getHouseholdTimeFormat(householdId?: string): Promise<TimeFormat> {
  const { rows } = await pool.query(
    'SELECT data->>\'timeFormat\' AS "timeFormat" FROM household_preferences WHERE household_id = $1',
    [householdId],
  );
  return rows[0]?.timeFormat === '24h' ? '24h' : '12h';
}

// Keep in sync with EventType / EVENT_TYPES in packages/core/src/types/index.ts
const VALID_EVENT_TYPES = new Set([
  'bottle',
  'nursing',
  'pump',
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

// GET /events/export — download household events as CSV
// Optional query params: from (ISO date), to (ISO date), babyId (UUID)
router.get('/export', async (req: AuthRequest, res) => {
  let { from, to } = req.query as Record<string, string | undefined>;
  const { babyId } = req.query as Record<string, string | undefined>;

  // Swap from/to if the caller entered them in reverse order
  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  // Validate optional babyId belongs to this household before using in query
  if (babyId) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM babies WHERE id = $1 AND household_id = $2',
      [babyId, req.householdId],
    );
    if (!rowCount) {
      res.status(403).json({ message: 'Baby not found in household' });
      return;
    }
  }

  const params: unknown[] = [req.householdId];
  // Additional WHERE clauses built incrementally; params array keeps them bound
  const filters: string[] = [];

  if (from) {
    params.push(from);
    filters.push(`e.started_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    filters.push(`e.started_at <= $${params.length}::timestamptz`);
  }
  if (babyId) {
    params.push(babyId);
    filters.push(`e.baby_id = $${params.length}`);
  }

  const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT e.started_at, e.ended_at, b.name AS baby_name, e.type, e.value, e.unit, e.notes,
            (SELECT u.display_name FROM users u WHERE u.id = e.logged_by) AS logged_by_name
     FROM events e
     JOIN babies b ON b.id = e.baby_id
     WHERE b.household_id = $1 AND e.deleted_at IS NULL${whereExtra}
     ORDER BY e.started_at DESC`,
    params,
  );
  const timeFormat = await getHouseholdTimeFormat(req.householdId);

  const csvEscape = (v: unknown): string => {
    if (v == null) {
      return '';
    }
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const durationMin = (start: Date, end: Date | null): string => {
    if (!end) {
      return '';
    }
    return String(Math.round((end.getTime() - start.getTime()) / 60000));
  };

  const header = 'Date,Time,Baby,Type,Value,Unit,Notes,Duration (min),Logged By\n';
  const lines = rows.map(r => {
    const d = new Date(r.started_at);
    const date = d.toISOString().slice(0, 10);
    const time = formatExportTime(d, timeFormat);
    return [
      date,
      time,
      csvEscape(r.baby_name),
      csvEscape(r.type),
      csvEscape(r.value),
      csvEscape(r.unit),
      csvEscape(r.notes),
      durationMin(d, r.ended_at ? new Date(r.ended_at) : null),
      csvEscape(r.logged_by_name),
    ].join(',');
  });

  const filename = `twintracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(header + lines.join('\n'));
});

// ── PDF helpers ───────────────────────────────────────────────────────────────

/** Format a duration in ms as "Xh Ym" or "Zm" for the PDF summary. */
function fmtDuration(ms: number): string {
  const totalMins = Math.round(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

/** Compute aggregate weekly stats from raw event rows (server-side, no @tt/core import). */
function computeWeeklyStats(
  rows: Array<{
    type: string;
    value: number | null;
    started_at: Date;
    ended_at: Date | null;
    baby_name: string;
  }>,
  weekStart: Date,
  weekEnd: Date,
): {
  totalOz: number;
  feedCount: number;
  avgOzPerFeed: number | null;
  napCount: number;
  totalNapMs: number;
  nightCount: number;
  totalNightMs: number;
  diaperCount: number;
} {
  // Only events in the requested window
  const inWindow = rows.filter(r => {
    const t = new Date(r.started_at).getTime();
    return t >= weekStart.getTime() && t <= weekEnd.getTime();
  });

  const bottles = inWindow.filter(r => r.type === 'bottle');
  const totalOz = bottles.reduce((s, r) => s + (r.value ?? 0), 0);
  const feedCount = inWindow.filter(r => r.type === 'bottle' || r.type === 'nursing').length;
  const avgOzPerFeed = bottles.length > 0 ? totalOz / bottles.length : null;

  const naps = inWindow.filter(r => r.type === 'nap' && r.ended_at != null);
  const totalNapMs = naps.reduce(
    (s, r) => s + (new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()),
    0,
  );

  const nights = inWindow.filter(r => r.type === 'sleep' && r.ended_at != null);
  const totalNightMs = nights.reduce(
    (s, r) => s + (new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()),
    0,
  );

  return {
    totalOz,
    feedCount,
    avgOzPerFeed,
    napCount: naps.length,
    totalNapMs,
    nightCount: nights.length,
    totalNightMs,
    diaperCount: inWindow.filter(r => r.type === 'diaper').length,
  };
}

// GET /events/export/pdf — download household events as a pediatrician-friendly PDF summary
// Optional query params: from (ISO date), to (ISO date), babyId (UUID)
router.get('/export/pdf', async (req: AuthRequest, res) => {
  let { from, to } = req.query as Record<string, string | undefined>;
  const { babyId } = req.query as Record<string, string | undefined>;

  // Swap from/to if the caller entered them in reverse order
  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  // Validate optional babyId belongs to this household
  if (babyId) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM babies WHERE id = $1 AND household_id = $2',
      [babyId, req.householdId],
    );
    if (!rowCount) {
      res.status(403).json({ message: 'Baby not found in household' });
      return;
    }
  }

  // Fetch babies in household (for summary header)
  const babyRows = await pool.query(
    `SELECT id, name, birth_date AS "birthDate" FROM babies WHERE household_id = $1 ORDER BY created_at`,
    [req.householdId],
  );
  const params: unknown[] = [req.householdId];
  const filters: string[] = [];

  if (from) {
    params.push(from);
    filters.push(`e.started_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    filters.push(`e.started_at <= $${params.length}::timestamptz`);
  }
  if (babyId) {
    params.push(babyId);
    filters.push(`e.baby_id = $${params.length}`);
  }

  const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT e.started_at, e.ended_at, b.name AS baby_name, b.id AS baby_id,
            e.type, e.value, e.unit, e.notes,
            (SELECT u.display_name FROM users u WHERE u.id = e.logged_by) AS logged_by_name
     FROM events e
     JOIN babies b ON b.id = e.baby_id
     WHERE b.household_id = $1 AND e.deleted_at IS NULL${whereExtra}
     ORDER BY e.started_at ASC`,
    params,
  );
  const timeFormat = await getHouseholdTimeFormat(req.householdId);

  // ── Build PDF ─────────────────────────────────────────────────────────────
  // Design: clean black-and-white A4 document — matches TwinTracker's design system.
  // Sections: title + date range, one summary card per baby, full event log table.

  const PAGE_MARGIN = 50;
  const PAGE_WIDTH = 595.28; // A4 points
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

  // Design tokens (points)
  const FONT_SIZE_TITLE = 20;
  const FONT_SIZE_HEADING = 13;
  const FONT_SIZE_SUBHEADING = 11;
  const FONT_SIZE_BODY = 9;
  const FONT_SIZE_CAPTION = 8;

  // Row height for the event log table
  const ROW_HEIGHT = 16;
  // Column widths for event log: Date | Time | Baby | Type | Value | Notes | Duration | Logged By
  const COL_WIDTHS = [60, 50, 60, 55, 45, 130, 55, 90];

  // bufferPages: true is required to use switchToPage() for the footer pass
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: { Title: 'TwinTracker Report', Author: 'TwinTracker' },
  });

  // Register brand fonts — Nunito for display/headings, DM Mono for body/stats
  doc.registerFont('Nunito', FONT_NUNITO);
  doc.registerFont('DMMono', FONT_DM_MONO);
  doc.registerFont('DMMono-Medium', FONT_DM_MONO_MEDIUM);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // ── Title block ───────────────────────────────────────────────────────────
  const rangeFrom = from
    ? new Date(from).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const rangeTo = to
    ? new Date(to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const rangeLabel =
    rangeFrom && rangeTo
      ? `${rangeFrom} – ${rangeTo}`
      : rangeFrom
        ? `From ${rangeFrom}`
        : rangeTo
          ? `Through ${rangeTo}`
          : 'All time';

  // Logo — 32pt square, vertically centred with the title text
  const LOGO_SIZE = 32;
  const TITLE_TEXT_X = PAGE_MARGIN + LOGO_SIZE + 10;
  doc.image(LOGO_PATH, PAGE_MARGIN, PAGE_MARGIN, { width: LOGO_SIZE, height: LOGO_SIZE });

  doc
    .font('Nunito')
    .fontSize(FONT_SIZE_TITLE)
    .fillColor('#000000')
    .text('TwinTracker Report', TITLE_TEXT_X, PAGE_MARGIN + 2);

  doc
    .font('DMMono')
    .fontSize(FONT_SIZE_SUBHEADING)
    .fillColor('#555555')
    .text(rangeLabel, TITLE_TEXT_X, PAGE_MARGIN + 26);

  doc
    .fontSize(FONT_SIZE_CAPTION)
    .text(
      `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      TITLE_TEXT_X,
      PAGE_MARGIN + 42,
    );

  doc.fillColor('#000000');

  // ── Per-baby summary cards ─────────────────────────────────────────────────
  const summaryBabies = babyId ? babyRows.rows.filter(b => b.id === babyId) : babyRows.rows;
  const weekEnd = to ? new Date(to) : new Date();
  const weekStart = from ? new Date(from) : new Date(weekEnd.getTime() - 7 * 24 * 60 * 60_000);

  let cardY = PAGE_MARGIN + 68;
  const CARD_PADDING = 10;
  const CARD_HEIGHT = 88;

  for (const baby of summaryBabies) {
    const babyEvents = rows.filter(r => r.baby_id === baby.id);
    const stats = computeWeeklyStats(babyEvents, weekStart, weekEnd);

    // Card border
    doc
      .rect(PAGE_MARGIN, cardY, CONTENT_WIDTH, CARD_HEIGHT)
      .strokeColor('#dddddd')
      .lineWidth(0.5)
      .stroke();

    // Baby name heading
    doc
      .font('Nunito')
      .fontSize(FONT_SIZE_HEADING)
      .fillColor('#000000')
      .text(baby.name, PAGE_MARGIN + CARD_PADDING, cardY + CARD_PADDING);

    if (baby.birthDate) {
      const ageMs = Date.now() - new Date(baby.birthDate).getTime();
      const ageWeeks = Math.floor(ageMs / (7 * 24 * 60 * 60_000));
      const ageLabel =
        ageWeeks < 8
          ? `${ageWeeks}w old`
          : ageWeeks < 52
            ? `${Math.floor(ageWeeks / 4.345)}mo old`
            : `${Math.floor(ageWeeks / 52)}y old`;
      doc
        .font('DMMono')
        .fontSize(FONT_SIZE_CAPTION)
        .fillColor('#555555')
        .text(ageLabel, PAGE_MARGIN + CARD_PADDING + 80, cardY + CARD_PADDING + 2);
    }

    doc.fillColor('#000000');

    // Stats grid — 4 columns
    const statY = cardY + CARD_PADDING + 22;
    const statColW = CONTENT_WIDTH / 4;

    const statItems = [
      { label: 'Feeds', value: String(stats.feedCount) },
      {
        label: 'Total oz',
        value:
          stats.totalOz > 0
            ? `${stats.totalOz % 1 === 0 ? stats.totalOz : stats.totalOz.toFixed(1)} oz`
            : '—',
      },
      {
        label: 'Avg oz/feed',
        value: stats.avgOzPerFeed != null ? `${stats.avgOzPerFeed.toFixed(1)} oz` : '—',
      },
      { label: 'Diapers', value: String(stats.diaperCount) },
      { label: 'Naps', value: String(stats.napCount) },
      { label: 'Nap time', value: stats.totalNapMs > 0 ? fmtDuration(stats.totalNapMs) : '—' },
      { label: 'Night sleeps', value: String(stats.nightCount) },
      {
        label: 'Night time',
        value: stats.totalNightMs > 0 ? fmtDuration(stats.totalNightMs) : '—',
      },
    ];

    statItems.forEach((item, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const sx = PAGE_MARGIN + CARD_PADDING + col * statColW;
      const sy = statY + row * 28;

      doc
        .font('DMMono-Medium')
        .fontSize(FONT_SIZE_BODY)
        .fillColor('#000000')
        .text(item.value, sx, sy, { width: statColW - 8 });

      doc
        .font('DMMono')
        .fontSize(FONT_SIZE_CAPTION)
        .fillColor('#888888')
        .text(item.label, sx, sy + 10, { width: statColW - 8 });
    });

    cardY += CARD_HEIGHT + 12;
  }

  // ── Event log table ───────────────────────────────────────────────────────
  const tableHeaderY = cardY + 10;

  doc
    .font('Nunito')
    .fontSize(FONT_SIZE_HEADING)
    .fillColor('#000000')
    .text('Event Log', PAGE_MARGIN, tableHeaderY);

  const tableTop = tableHeaderY + 20;
  const COL_HEADERS = ['Date', 'Time', 'Baby', 'Type', 'Value', 'Notes', 'Duration', 'Logged By'];

  // Table header row background
  doc.rect(PAGE_MARGIN, tableTop, CONTENT_WIDTH, ROW_HEIGHT).fillColor('#f0f0f0').fill();

  // Table header labels
  doc.fillColor('#000000').font('DMMono-Medium').fontSize(FONT_SIZE_CAPTION);
  let colX = PAGE_MARGIN + 4;
  COL_HEADERS.forEach((h, i) => {
    doc.text(h, colX, tableTop + 4, { width: COL_WIDTHS[i] - 4, lineBreak: false });
    colX += COL_WIDTHS[i];
  });

  // Data rows
  let rowY = tableTop + ROW_HEIGHT;
  doc.font('DMMono').fontSize(FONT_SIZE_CAPTION);

  for (const r of rows) {
    // Start a new page if near the bottom (leave 60pt margin)
    if (rowY > doc.page.height - 60) {
      doc.addPage();
      rowY = PAGE_MARGIN;

      // Repeat header on new page
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, ROW_HEIGHT).fillColor('#f0f0f0').fill();

      doc.fillColor('#000000').font('DMMono-Medium').fontSize(FONT_SIZE_CAPTION);
      colX = PAGE_MARGIN + 4;
      COL_HEADERS.forEach((h, i) => {
        doc.text(h, colX, rowY + 4, { width: COL_WIDTHS[i] - 4, lineBreak: false });
        colX += COL_WIDTHS[i];
      });

      rowY += ROW_HEIGHT;
      doc.font('DMMono').fontSize(FONT_SIZE_CAPTION);
    }

    // Alternate row shading
    if (rows.indexOf(r) % 2 === 0) {
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, ROW_HEIGHT).fillColor('#fafafa').fill();
    }

    const d = new Date(r.started_at);
    const date = d.toISOString().slice(0, 10);
    const time = formatExportTime(d, timeFormat);
    const durationMs = r.ended_at ? new Date(r.ended_at).getTime() - d.getTime() : null;
    const valueStr = r.value != null ? `${r.value}${r.unit ? ' ' + r.unit : ''}` : '';

    const cells = [
      date,
      time,
      String(r.baby_name ?? ''),
      String(r.type),
      valueStr,
      String(r.notes ?? ''),
      durationMs != null ? fmtDuration(durationMs) : '',
      String(r.logged_by_name ?? ''),
    ];

    doc.fillColor('#000000');
    colX = PAGE_MARGIN + 4;
    cells.forEach((cell, i) => {
      doc.text(cell, colX, rowY + 4, {
        width: COL_WIDTHS[i] - 4,
        lineBreak: false,
        ellipsis: true,
      });
      colX += COL_WIDTHS[i];
    });

    rowY += ROW_HEIGHT;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .font('DMMono')
      .fontSize(FONT_SIZE_CAPTION)
      .fillColor('#aaaaaa')
      .text(`TwinTracker · Page ${i + 1} of ${pageCount}`, PAGE_MARGIN, doc.page.height - 30, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
  }

  doc.end();

  await new Promise<void>(resolve => doc.on('end', resolve));

  const pdfBuffer = Buffer.concat(chunks);
  const pdfFilename = `twintracker-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

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
     LIMIT 1000`,
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
  // 16 oz — keep in sync with AAP_MAX_BOTTLE_OZ in packages/core/src/config.ts
  const MAX_BOTTLE_OZ = 16;
  const MAX_PUMP_OZ = 24;
  if (type === 'bottle' && value != null && value > MAX_BOTTLE_OZ) {
    res.status(400).json({ message: `Bottle value cannot exceed ${MAX_BOTTLE_OZ} oz` });
    return;
  }
  if (type === 'pump' && value != null && value > MAX_PUMP_OZ) {
    res.status(400).json({ message: `Pump value cannot exceed ${MAX_PUMP_OZ} oz` });
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
