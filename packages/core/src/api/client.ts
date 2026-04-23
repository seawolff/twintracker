/** Typed API client with JWT Bearer auth and transparent access-token refresh. */
import type {
  AuthResponse,
  Baby,
  JoinRequest,
  LogEventPayload,
  LoginRequest,
  NapAlarm,
  RegisterRequest,
  StorageInterface,
  TrackerEvent,
} from '../types';

let baseUrl = '';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let clientPlatform: 'web' | 'ios' | 'android' = 'web';
let clientAppVersion: string | null = null;
let tokenStorage: StorageInterface | null = null;

export function configure(
  url: string,
  token?: string,
  platform?: 'web' | 'ios' | 'android',
  appVersion?: string,
) {
  baseUrl = url;
  if (platform === 'android' || platform === 'ios') {
    console.log('[api.configure]', { baseUrl: url, platform, appVersion: appVersion ?? null });
  }
  if (token) {
    accessToken = token;
  }
  if (platform) {
    clientPlatform = platform;
  }
  if (appVersion) {
    clientAppVersion = appVersion;
  }
}

export function setToken(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh !== undefined) {
    refreshToken = refresh;
  }
}

export function setTokenStorage(storage: StorageInterface | null) {
  tokenStorage = storage;
}

async function persistTokens(access: string, refresh: string): Promise<void> {
  if (tokenStorage) {
    await tokenStorage.setItem('tt_access_token', access);
    await tokenStorage.setItem('tt_refresh_token', refresh);
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tt_access_token', access);
    localStorage.setItem('tt_refresh_token', refresh);
  }
}

async function clearPersistedTokens(): Promise<void> {
  if (tokenStorage) {
    await tokenStorage.removeItem('tt_access_token');
    await tokenStorage.removeItem('tt_refresh_token');
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('tt_access_token');
    localStorage.removeItem('tt_refresh_token');
  }
}

// Token refresh state — prevent concurrent refresh attempts
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const res = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    throw new Error('Refresh failed');
  }
  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await persistTokens(tokens.accessToken, tokens.refreshToken);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Platform': clientPlatform,
    ...(clientAppVersion ? { 'X-App-Version': clientAppVersion } : {}),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch (error) {
    console.error('[api.request] network failure', {
      baseUrl,
      path,
      method: options.method ?? 'GET',
      platform: clientPlatform,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Auto-refresh on 401 if we have a refresh token
  if (res.status === 401 && refreshToken && !path.includes('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      await refreshPromise;
      // Retry with new token
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    } catch {
      accessToken = null;
      refreshToken = null;
      await clearPersistedTokens();
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as {
      message?: string;
    };
    throw Object.assign(new Error(body.message ?? res.statusText), { status: res.status });
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function requestText(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { headers });
  } catch (error) {
    console.error('[api.requestText] network failure', {
      baseUrl,
      path,
      platform: clientPlatform,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (res.status === 401 && refreshToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      await refreshPromise;
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${baseUrl}${path}`, { headers });
    } catch {
      accessToken = null;
      refreshToken = null;
      await clearPersistedTokens();
    }
  }
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.text();
}

async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { headers });
  } catch (error) {
    console.error('[api.requestBlob] network failure', {
      baseUrl,
      path,
      platform: clientPlatform,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (res.status === 401 && refreshToken) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      await refreshPromise;
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${baseUrl}${path}`, { headers });
    } catch {
      accessToken = null;
      refreshToken = null;
      await clearPersistedTokens();
    }
  }
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.blob();
}

export const api = {
  auth: {
    login: (data: LoginRequest) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: RegisterRequest) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    join: (data: JoinRequest) =>
      request<AuthResponse>('/api/auth/join', { method: 'POST', body: JSON.stringify(data) }),
    googleAuth: (data: { idToken: string; inviteCode?: string }) =>
      request<AuthResponse>('/api/auth/google', { method: 'POST', body: JSON.stringify(data) }),
    refresh: (rToken: string) =>
      request<AuthResponse>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: rToken }),
      }),
    me: () =>
      request<{ id: string; email: string; displayName?: string; emailVerified?: boolean }>(
        '/api/auth/me',
      ),
    updateMe: (data: { name: string }) =>
      request<{ id: string; email: string; displayName?: string }>('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    verifyEmail: (token: string) =>
      request<{
        verified: boolean;
        accessToken?: string;
        refreshToken?: string;
        inviteCode?: string;
        displayName?: string | null;
      }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
    resendVerification: () =>
      request<{ message: string }>('/api/auth/resend-verification', { method: 'POST' }),
    deleteAccount: () => request<void>('/api/auth/me', { method: 'DELETE' }),
    householdMembers: () =>
      request<{ id: string; displayName?: string | null; createdAt: string }[]>(
        '/api/auth/household/members',
      ),
  },
  babies: {
    list: () => request<Baby[]>('/api/babies'),
    create: (data: {
      name: string;
      birthDate?: string;
      weightKg?: number | null;
      heightCm?: number | null;
      sex?: 'male' | 'female' | null;
    }) => request<Baby>('/api/babies', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: {
        name?: string;
        birthDate?: string | null;
        weightKg?: number | null;
        heightCm?: number | null;
        sex?: 'male' | 'female' | null;
      },
    ) => request<Baby>(`/api/babies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  alarms: {
    active: () => request<NapAlarm[]>('/api/alarms/active'),
    create: (data: { babyId: string; firesAt: string; durationMs: number; label: string }) =>
      request<NapAlarm>('/api/alarms', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { firesAt?: string; durationMs?: number; dismissedAt?: string }) =>
      request<NapAlarm>(`/api/alarms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  preferences: {
    get: () => request<Record<string, unknown>>('/api/preferences'),
    put: (data: Record<string, unknown>) =>
      request<Record<string, unknown>>('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  events: {
    list: (since?: string) =>
      request<TrackerEvent[]>(`/api/events${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    create: (data: LogEventPayload) =>
      request<TrackerEvent>('/api/events', { method: 'POST', body: JSON.stringify(data) }),
    patch: (id: string, data: Partial<LogEventPayload>) =>
      request<TrackerEvent>(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),
    deleteAll: () => request<void>('/api/events', { method: 'DELETE' }),
    exportCsv: (opts?: { from?: string; to?: string; babyId?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.from) {
        qs.set('from', opts.from);
      }
      if (opts?.to) {
        qs.set('to', opts.to);
      }
      if (opts?.babyId) {
        qs.set('babyId', opts.babyId);
      }
      const query = qs.toString();
      return requestText(`/api/events/export${query ? `?${query}` : ''}`);
    },
    exportPdf: (opts?: { from?: string; to?: string; babyId?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.from) {
        qs.set('from', opts.from);
      }
      if (opts?.to) {
        qs.set('to', opts.to);
      }
      if (opts?.babyId) {
        qs.set('babyId', opts.babyId);
      }
      const query = qs.toString();
      return requestBlob(`/api/events/export/pdf${query ? `?${query}` : ''}`);
    },
  },
};
