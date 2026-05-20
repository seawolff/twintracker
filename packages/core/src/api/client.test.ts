import { jest } from '@jest/globals';
import { AuthFailedError, configure, decodeTokenExpiry, isTokenExpired, setToken } from './client';

// Minimal base64url encode without padding (matches JWT encoding)
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;
}

const HOUR_S = 3600;
const nowS = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

describe('decodeTokenExpiry', () => {
  it('returns exp from a valid JWT', () => {
    const exp = nowS() + HOUR_S;
    expect(decodeTokenExpiry(makeJwt({ exp }))).toBe(exp);
  });

  it('returns null when exp is missing', () => {
    expect(decodeTokenExpiry(makeJwt({ sub: 'user' }))).toBeNull();
  });

  it('returns null for a malformed token', () => {
    expect(decodeTokenExpiry('not.a.token')).toBeNull();
    expect(decodeTokenExpiry('')).toBeNull();
  });
});

describe('isTokenExpired', () => {
  it('returns false when token expires in the future beyond the buffer', () => {
    const token = makeJwt({ exp: nowS() + 120 });
    expect(isTokenExpired(token, 30_000)).toBe(false);
  });

  it('returns true when token is already expired', () => {
    const token = makeJwt({ exp: nowS() - 60 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true when token expires within the buffer window', () => {
    // expires in 10s, buffer is 30s → treat as expired
    const token = makeJwt({ exp: nowS() + 10 });
    expect(isTokenExpired(token, 30_000)).toBe(true);
  });

  it('returns true for a malformed token', () => {
    expect(isTokenExpired('bad')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AuthFailedError
// ---------------------------------------------------------------------------

describe('AuthFailedError', () => {
  it('is an instance of Error', () => {
    expect(new AuthFailedError()).toBeInstanceOf(Error);
  });

  it('has name AuthFailedError', () => {
    expect(new AuthFailedError().name).toBe('AuthFailedError');
  });
});

// ---------------------------------------------------------------------------
// Fetch-level behaviour
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchInput = Response | Error;

function setupFetch(responses: FetchInput[]): void {
  let i = 0;
  (global as Record<string, unknown>).fetch = (_url: unknown, _opts?: unknown) => {
    const next = responses[i++];
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next);
  };
}

function fetchCallUrls(): string[] {
  return (
    (global.fetch as unknown as { mock?: { calls: [string][] } }).mock?.calls.map(([url]) => url) ??
    []
  );
}

beforeEach(() => {
  configure('http://test');
  setToken(null, null);
});

afterEach(() => {
  delete (global as Record<string, unknown>).fetch;
});

describe('401 handling — token preservation', () => {
  it('retries with a refreshed token when a valid token gets a surprise 401', async () => {
    // Token is still valid locally but the server rejects it (e.g. secret rotation).
    // No proactive refresh fires — the 401 handler takes over.
    const freshToken = makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' });
    setToken(makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' }), 'valid-refresh');

    let callCount = 0;
    (global as Record<string, unknown>).fetch = (_url: unknown) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401));
      }
      if (callCount === 2) {
        return Promise.resolve(
          jsonResponse({ accessToken: freshToken, refreshToken: 'new-refresh' }),
        );
      }
      return Promise.resolve(jsonResponse([{ id: '1' }]));
    };

    const { api } = await import('./client');
    const result = await api.events.list();
    expect(result).toEqual([{ id: '1' }]);
    expect(callCount).toBe(3);
  });

  it('preserves tokens when refresh fails due to a network error on a surprise 401', async () => {
    // Token is valid locally; server returns 401 (e.g. mid-session); then the network
    // goes down during the refresh attempt. Tokens must survive so the next resume retries.
    setToken(makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' }), 'valid-refresh');

    let callCount = 0;
    (global as Record<string, unknown>).fetch = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401));
      }
      return Promise.reject(new Error('Network request failed'));
    };

    const { api } = await import('./client');
    const err = await api.events.list().catch((e: unknown) => e);
    // Must be a plain network Error, not AuthFailedError — tokens stay intact
    expect(err).not.toBeInstanceOf(AuthFailedError);
    expect(err).toBeInstanceOf(Error);
  });

  it('throws AuthFailedError and clears tokens when server definitively rejects the refresh', async () => {
    // Valid token gets 401, refresh also gets 401 → session is dead, tokens cleared.
    setToken(makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' }), 'expired-refresh');

    (global as Record<string, unknown>).fetch = () =>
      Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401));

    const { api } = await import('./client');
    await expect(api.events.list()).rejects.toBeInstanceOf(AuthFailedError);
  });
});

describe('proactive refresh', () => {
  it('refreshes before sending the request when the access token is expired', async () => {
    const freshToken = makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' });
    setToken(makeJwt({ exp: nowS() - 60, sub: 'u1' }), 'valid-refresh');

    const calls: string[] = [];
    (global as Record<string, unknown>).fetch = (url: unknown) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return Promise.resolve(
          jsonResponse({ accessToken: freshToken, refreshToken: 'new-refresh' }),
        );
      }
      return Promise.resolve(jsonResponse([]));
    };

    const { api } = await import('./client');
    await api.events.list();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/api/auth/refresh');
    expect(calls[1]).toContain('/api/events');
  });

  it('proceeds with the stale token when proactive refresh hits a network error', async () => {
    setToken(makeJwt({ exp: nowS() - 60, sub: 'u1' }), 'valid-refresh');

    let callCount = 0;
    (global as Record<string, unknown>).fetch = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network request failed'));
      }
      return Promise.resolve(jsonResponse([{ id: '2' }]));
    };

    const { api } = await import('./client');
    const result = await api.events.list();
    expect(result).toEqual([{ id: '2' }]);
  });

  it('does not proactively refresh for auth endpoints', async () => {
    setToken(makeJwt({ exp: nowS() - 60, sub: 'u1' }), 'valid-refresh');

    const calls: string[] = [];
    (global as Record<string, unknown>).fetch = (url: unknown) => {
      calls.push(String(url));
      return Promise.resolve(
        jsonResponse({ accessToken: 'tok', refreshToken: 'ref', inviteCode: 'XX' }),
      );
    };

    const { api } = await import('./client');
    await api.auth.login({ email: 'a@b.com', password: 'pw' });

    // Only one fetch — no proactive refresh for /auth/ paths
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/api/auth/login');
  });

  it('does not refresh when token is still valid', async () => {
    setToken(makeJwt({ exp: nowS() + HOUR_S, sub: 'u1' }), 'valid-refresh');

    const calls: string[] = [];
    (global as Record<string, unknown>).fetch = (url: unknown) => {
      calls.push(String(url));
      return Promise.resolve(jsonResponse([]));
    };

    const { api } = await import('./client');
    await api.events.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/api/events');
  });
});
