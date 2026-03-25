/**
 * Type contract tests — ensure shared types used across web and native
 * remain consistent and complete. These tests fail at compile time if
 * a required field is missing or has the wrong shape.
 */

import type {
  Baby,
  BabyColor,
  TrackerEvent,
  EventType,
  LogEventPayload,
  AuthTokens,
  AuthResponse,
  JoinRequest,
  LoginRequest,
  RegisterRequest,
  StorageInterface,
  LatestEventMap,
  NextAction,
  Urgency,
  User,
} from './index';

// ── BabyColor must include all DB-assigned colors ────────────────────────────
const validColors: BabyColor[] = ['amber', 'emerald', 'slate', 'rose', 'sky', 'violet'];
describe('BabyColor', () => {
  it('includes all six palette entries', () => {
    expect(validColors).toHaveLength(6);
  });
});

// ── Baby ─────────────────────────────────────────────────────────────────────
describe('Baby shape', () => {
  it('accepts a valid baby object', () => {
    const baby: Baby = {
      id: 'b1',
      name: 'Finn',
      color: 'amber',
      createdAt: new Date().toISOString(),
    };
    expect(baby.name).toBe('Finn');
  });

  it('accepts optional birthDate', () => {
    const baby: Baby = {
      id: 'b2',
      name: 'Quinn',
      color: 'emerald',
      birthDate: '2024-01-01',
      createdAt: new Date().toISOString(),
    };
    expect(baby.birthDate).toBeDefined();
  });
});

// ── EventType completeness ────────────────────────────────────────────────────
describe('EventType', () => {
  const eventTypes: EventType[] = [
    'bottle',
    'nursing',
    'nap',
    'sleep',
    'diaper',
    'medicine',
    'food',
    'milestone',
  ];
  it('covers all eight event types', () => {
    expect(eventTypes).toHaveLength(8);
  });
});

// ── TrackerEvent ──────────────────────────────────────────────────────────────
describe('TrackerEvent shape', () => {
  it('accepts a valid event with required fields', () => {
    const ev: TrackerEvent = {
      id: 'e1',
      babyId: 'b1',
      type: 'bottle',
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(ev.type).toBe('bottle');
  });

  it('accepts optional loggedByName field', () => {
    const ev: TrackerEvent = {
      id: 'e2',
      babyId: 'b1',
      type: 'nap',
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      loggedByName: 'Mom',
    };
    expect(ev.loggedByName).toBe('Mom');
  });

  it('allows loggedByName to be absent (pre-attribution events)', () => {
    const ev: TrackerEvent = {
      id: 'e3',
      babyId: 'b1',
      type: 'diaper',
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(ev.loggedByName).toBeUndefined();
  });
});

// ── Auth types ────────────────────────────────────────────────────────────────
describe('AuthResponse includes inviteCode beyond AuthTokens', () => {
  it('AuthTokens has accessToken + refreshToken', () => {
    const t: AuthTokens = { accessToken: 'a', refreshToken: 'r' };
    expect(t.accessToken).toBe('a');
  });

  it('AuthResponse extends tokens with inviteCode', () => {
    const r: AuthResponse = { accessToken: 'a', refreshToken: 'r', inviteCode: 'ABCD1234' };
    expect(r.inviteCode).toHaveLength(8);
  });

  it('AuthResponse accepts optional displayName', () => {
    const r: AuthResponse = {
      accessToken: 'a',
      refreshToken: 'r',
      inviteCode: 'ABCD1234',
      displayName: 'Mom',
    };
    expect(r.displayName).toBe('Mom');
  });

  it('AuthResponse allows displayName to be null or absent', () => {
    const withNull: AuthResponse = {
      accessToken: 'a',
      refreshToken: 'r',
      inviteCode: 'X',
      displayName: null,
    };
    const withoutField: AuthResponse = { accessToken: 'a', refreshToken: 'r', inviteCode: 'X' };
    expect(withNull.displayName).toBeNull();
    expect(withoutField.displayName).toBeUndefined();
  });
});

// ── User ──────────────────────────────────────────────────────────────────────
describe('User shape', () => {
  it('accepts a valid user with required fields', () => {
    const u: User = { id: 'u1', email: 'a@b.com', createdAt: new Date().toISOString() };
    expect(u.email).toBe('a@b.com');
  });

  it('accepts optional displayName', () => {
    const u: User = {
      id: 'u1',
      email: 'a@b.com',
      createdAt: new Date().toISOString(),
      displayName: 'Dad',
    };
    expect(u.displayName).toBe('Dad');
  });
});

// ── JoinRequest ───────────────────────────────────────────────────────────────
describe('JoinRequest', () => {
  it('requires email, password, and inviteCode', () => {
    const req: JoinRequest = { email: 'a@b.com', password: 'pw', inviteCode: 'ABCD1234' };
    expect(req.inviteCode).toBeDefined();
  });

  it('accepts optional name for parent attribution', () => {
    const req: JoinRequest = {
      email: 'a@b.com',
      password: 'pw',
      inviteCode: 'ABCD1234',
      name: 'Dad',
    };
    expect(req.name).toBe('Dad');
  });
});

// ── RegisterRequest ───────────────────────────────────────────────────────────
describe('RegisterRequest', () => {
  it('accepts optional name for parent attribution', () => {
    const req: RegisterRequest = { email: 'a@b.com', password: 'pw', name: 'Mom' };
    expect(req.name).toBe('Mom');
  });

  it('allows name to be absent', () => {
    const req: RegisterRequest = { email: 'a@b.com', password: 'pw' };
    expect(req.name).toBeUndefined();
  });
});

// ── StorageInterface ──────────────────────────────────────────────────────────
describe('StorageInterface', () => {
  it('is satisfied by a synchronous implementation (localStorage-like)', () => {
    const store: StorageInterface = {
      getItem: (key: string) => (key === 'x' ? 'val' : null),
      setItem: (_k: string, _v: string) => {},
      removeItem: (_k: string) => {},
    };
    expect(store.getItem('x')).toBe('val');
  });

  it('is satisfied by an async implementation (AsyncStorage-like)', () => {
    const store: StorageInterface = {
      getItem: (_key: string) => Promise.resolve(null),
      setItem: (_k: string, _v: string) => Promise.resolve(),
      removeItem: (_k: string) => Promise.resolve(),
    };
    expect(store.getItem('x')).toBeInstanceOf(Promise);
  });
});

// ── Urgency ───────────────────────────────────────────────────────────────────
describe('Urgency', () => {
  const levels: Urgency[] = ['ok', 'soon', 'overdue'];
  it('has exactly three levels', () => {
    expect(levels).toHaveLength(3);
  });
});

// Suppress unused-variable warnings — these are compile-time checks
void ({} as LogEventPayload);
void ({} as NextAction);
void ({} as LatestEventMap);
void ({} as LoginRequest);
