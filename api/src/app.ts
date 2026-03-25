import express from 'express';
import morgan from 'morgan';
import { pool } from './db';
import authRouter from './routes/auth';
import babiesRouter from './routes/babies';
import eventsRouter from './routes/events';
import preferencesRouter from './routes/preferences';
import alarmsRouter from './routes/alarms';

const app = express();

app.use(express.json());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Deep health check: verify DB connectivity so the deploy pipeline can gate on a real signal
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/babies', babiesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/alarms', alarmsRouter);

// Global error handler
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  },
);

export default app;
