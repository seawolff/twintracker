export const EVENT_TYPES = [
  'bottle',
  'nursing',
  'nap',
  'sleep',
  'diaper',
  'medicine',
  'food',
  'milestone',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type BabyColor = 'amber' | 'emerald' | 'slate' | 'rose' | 'sky' | 'violet';

export type Urgency = 'ok' | 'soon' | 'overdue';

export interface Baby {
  id: string;
  name: string;
  color: BabyColor;
  birthDate?: string;
  createdAt: string;
}

export interface TrackerEvent {
  id: string;
  babyId: string;
  type: EventType;
  value?: number;
  unit?: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  loggedByName?: string;
}

/** key: `${babyId}:${eventType}` → most recent event of that type for that baby */
export type LatestEventMap = Record<string, TrackerEvent>;

export interface LogEventPayload {
  babyId: string;
  type: EventType;
  value?: number;
  unit?: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
}

export interface NextAction {
  action: string;
  detail: string;
  targetMs: number;
  totalMs: number;
  urgency: Urgency;
}

export interface PredictedAction {
  type: 'bottle' | 'diaper' | 'nap';
  /** Human-readable label: "Bottle in 45m", "Change overdue", "Nap in 1h 10m" */
  label: string;
  /** ms until predicted event; negative = overdue */
  remainingMs: number;
  /** Full interval used — for future progress rendering */
  intervalMs: number;
  urgency: Urgency;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
  displayName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  inviteCode: string;
  isAdmin?: boolean;
  displayName?: string | null;
  emailVerified?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface JoinRequest {
  email: string;
  password: string;
  inviteCode: string;
  name?: string;
}

/** Server-side nap alarm — fires at a specific time, synced across all devices. */
export interface NapAlarm {
  id: string;
  babyId: string;
  householdId: string;
  firesAt: string; // ISO 8601
  durationMs: number; // total window for ring progress
  label: string;
  dismissedAt?: string;
  createdAt: string;
}

export interface StorageInterface {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}
