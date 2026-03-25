# API

Express + Postgres backend for TwinTracker.

## Routes

| Method | Path               | Auth | Description          |
| ------ | ------------------ | ---- | -------------------- |
| POST   | /api/auth/register | No   | Create account       |
| POST   | /api/auth/login    | No   | Get tokens           |
| POST   | /api/auth/refresh  | No   | Refresh access token |
| GET    | /api/babies        | Yes  | List babies          |
| POST   | /api/babies        | Yes  | Add a baby           |
| GET    | /api/events?since= | Yes  | Poll events          |
| POST   | /api/events        | Yes  | Log an event         |
| DELETE | /api/events/:id    | Yes  | Delete an event      |

## Upgrading polling to SSE

The client currently polls `GET /api/events?since=<ISO>` every 15 seconds.

To upgrade to Server-Sent Events:

1. Add a new route `GET /api/events/stream` that keeps the connection open:

```typescript
router.get('/stream', requireAuth, async (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Send initial batch
  // ... query recent events, send(events)

  // Subscribe to Postgres NOTIFY or poll DB on an interval
  const id = setInterval(async () => {
    const events = await fetchNewEvents(req.userId!, lastSent);
    if (events.length) send(events);
  }, 2000);

  req.on('close', () => clearInterval(id));
});
```

2. Update `packages/core/src/hooks/useEventStore.ts` to use `EventSource` instead of polling.

The polling approach is simpler, cheaper to host, and sufficient for <10 concurrent users.
SSE cuts latency to ~2s and eliminates unnecessary requests at scale.
