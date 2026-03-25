/** Typed API client with JWT Bearer auth and transparent access-token refresh. */
import type {
  AuthResponse,
  Baby,
  JoinRequest,
  LogEventPayload,
  LoginRequest,
  NapAlarm,
  RegisterRequest,
  TrackerEvent,
} from '../types';

let baseUrl = '';
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function configure(url: string, token?: string) {
  baseUrl = url;
  if (token) {
    accessToken = token;
  }
}

export function setToken(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh !== undefined) {
    refreshToken = refresh;
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
  // Persist new tokens to storage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tt_access_token', tokens.accessToken);
    localStorage.setItem('tt_refresh_token', tokens.refreshToken);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${baseUrl}${path}`, { ...options, headers });

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

export const api = {
  auth: {
    login: (data: LoginRequest) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: RegisterRequest) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    join: (data: JoinRequest) =>
      request<AuthResponse>('/api/auth/join', { method: 'POST', body: JSON.stringify(data) }),
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
      request<{ verified: boolean }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
    resendVerification: () =>
      request<{ message: string }>('/api/auth/resend-verification', { method: 'POST' }),
  },
  babies: {
    list: () => request<Baby[]>('/api/babies'),
    create: (data: { name: string; birthDate?: string }) =>
      request<Baby>('/api/babies', { method: 'POST', body: JSON.stringify(data) }),
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
  },
};
