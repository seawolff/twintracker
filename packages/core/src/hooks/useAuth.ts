import { useCallback, useEffect, useState } from 'react';
import { api, setToken } from '../api/client';
import type { StorageInterface, User } from '../types';

const TOKEN_KEY = 'tt_access_token';
const REFRESH_KEY = 'tt_refresh_token';
const INVITE_KEY = 'tt_invite_code';
const DISPLAY_NAME_KEY = 'tt_display_name';
const EMAIL_VERIFIED_KEY = 'tt_email_verified';

function webStorage(): StorageInterface | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function decodeAdm(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !!payload.adm;
  } catch {
    return false;
  }
}

export function useAuth(storage?: StorageInterface) {
  const [user, setUser] = useState<User | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  const getStore = () => storage ?? webStorage();

  // Eagerly set both tokens from sync storage (web localStorage) before any effects run.
  // This fixes the race where API calls fire before the async effect sets the token.
  const [loading, setLoading] = useState(() => {
    const store = storage ?? webStorage();
    if (store) {
      const access = store.getItem(TOKEN_KEY);
      const refresh = store.getItem(REFRESH_KEY);
      if (typeof access === 'string' && access) {
        setToken(access, typeof refresh === 'string' ? refresh : null);
        return false; // already initialized
      }
    }
    return true; // async storage (native) needs the effect below
  });

  // Always start false to match server render — updated in effect below.
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (!loading) {
      // Even for sync init, load invite code + admin flag + display name + emailVerified into state
      const store = getStore();
      const code = store?.getItem(INVITE_KEY);
      if (typeof code === 'string' && code) {
        setInviteCode(code);
      }
      const name = store?.getItem(DISPLAY_NAME_KEY);
      if (typeof name === 'string' && name) {
        setDisplayName(name);
      }
      const access = store?.getItem(TOKEN_KEY);
      if (typeof access === 'string' && access) {
        setIsAdmin(decodeAdm(access));
      }
      const verified = store?.getItem(EMAIL_VERIFIED_KEY);
      if (typeof verified === 'string') {
        setEmailVerified(verified === 'true');
      }
      return;
    }
    const init = async () => {
      const store = getStore();
      const access = await store?.getItem(TOKEN_KEY);
      const refresh = await store?.getItem(REFRESH_KEY);
      const code = await store?.getItem(INVITE_KEY);
      const name = await store?.getItem(DISPLAY_NAME_KEY);
      const verified = await store?.getItem(EMAIL_VERIFIED_KEY);
      if (access) {
        setToken(access, refresh ?? null);
        setIsAdmin(decodeAdm(access));
      }
      if (code) {
        setInviteCode(code);
      }
      if (name) {
        setDisplayName(name);
      }
      if (typeof verified === 'string') {
        setEmailVerified(verified === 'true');
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.auth.login({ email, password });
    const store = getStore();
    await store?.setItem(TOKEN_KEY, tokens.accessToken);
    await store?.setItem(REFRESH_KEY, tokens.refreshToken);
    await store?.setItem(INVITE_KEY, tokens.inviteCode);
    if (tokens.displayName) {
      await store?.setItem(DISPLAY_NAME_KEY, tokens.displayName);
      setDisplayName(tokens.displayName);
    } else {
      await store?.removeItem(DISPLAY_NAME_KEY);
      setDisplayName(null);
    }
    const verified = tokens.emailVerified ?? false;
    await store?.setItem(EMAIL_VERIFIED_KEY, String(verified));
    setEmailVerified(verified);
    setToken(tokens.accessToken, tokens.refreshToken);
    setInviteCode(tokens.inviteCode);
    setIsAdmin(tokens.isAdmin ?? false);
    setUser({ id: '', email, createdAt: new Date().toISOString() });
    return tokens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const tokens = await api.auth.register({ email, password, name });
    const store = getStore();
    await store?.setItem(TOKEN_KEY, tokens.accessToken);
    await store?.setItem(REFRESH_KEY, tokens.refreshToken);
    await store?.setItem(INVITE_KEY, tokens.inviteCode);
    if (tokens.displayName) {
      await store?.setItem(DISPLAY_NAME_KEY, tokens.displayName);
      setDisplayName(tokens.displayName);
    } else {
      await store?.removeItem(DISPLAY_NAME_KEY);
      setDisplayName(null);
    }
    const verified = tokens.emailVerified ?? false;
    await store?.setItem(EMAIL_VERIFIED_KEY, String(verified));
    setEmailVerified(verified);
    setToken(tokens.accessToken, tokens.refreshToken);
    setInviteCode(tokens.inviteCode);
    setIsAdmin(tokens.isAdmin ?? false);
    setUser({ id: '', email, createdAt: new Date().toISOString() });
    return tokens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback(async (email: string, password: string, code: string, name?: string) => {
    const tokens = await api.auth.join({ email, password, inviteCode: code, name });
    const store = getStore();
    await store?.setItem(TOKEN_KEY, tokens.accessToken);
    await store?.setItem(REFRESH_KEY, tokens.refreshToken);
    await store?.setItem(INVITE_KEY, tokens.inviteCode);
    if (tokens.displayName) {
      await store?.setItem(DISPLAY_NAME_KEY, tokens.displayName);
      setDisplayName(tokens.displayName);
    } else {
      await store?.removeItem(DISPLAY_NAME_KEY);
      setDisplayName(null);
    }
    const verified = tokens.emailVerified ?? false;
    await store?.setItem(EMAIL_VERIFIED_KEY, String(verified));
    setEmailVerified(verified);
    setToken(tokens.accessToken, tokens.refreshToken);
    setInviteCode(tokens.inviteCode);
    setIsAdmin(tokens.isAdmin ?? false);
    setUser({ id: '', email, createdAt: new Date().toISOString() });
    return tokens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    const store = getStore();
    await store?.removeItem(TOKEN_KEY);
    await store?.removeItem(REFRESH_KEY);
    await store?.removeItem(INVITE_KEY);
    await store?.removeItem(DISPLAY_NAME_KEY);
    await store?.removeItem(EMAIL_VERIFIED_KEY);
    setToken(null, null);
    setUser(null);
    setInviteCode(null);
    setDisplayName(null);
    setIsAdmin(false);
    setEmailVerified(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    await api.auth.updateMe({ name });
    const store = getStore();
    const trimmed = name.trim();
    if (trimmed) {
      await store?.setItem(DISPLAY_NAME_KEY, trimmed);
      setDisplayName(trimmed);
    } else {
      await store?.removeItem(DISPLAY_NAME_KEY);
      setDisplayName(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Call after the user clicks the verification link; marks local state as verified. */
  const markEmailVerified = useCallback(async () => {
    const store = getStore();
    await store?.setItem(EMAIL_VERIFIED_KEY, 'true');
    setEmailVerified(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-fetches emailVerified from the server — call when app foregrounds after verification. */
  const refreshEmailVerified = useCallback(async () => {
    try {
      const me = await api.auth.me();
      if (me.emailVerified) {
        const store = getStore();
        await store?.setItem(EMAIL_VERIFIED_KEY, 'true');
        setEmailVerified(true);
      }
    } catch {
      // ignore — stale state is fine, gate will persist until next refresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Trigger a fresh verification email from the server. */
  const resendVerification = useCallback(async () => {
    await api.auth.resendVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthenticated =
    user !== null ||
    (() => {
      const store = getStore();
      if (!store) {
        return false;
      }
      const result = store.getItem(TOKEN_KEY);
      if (result instanceof Promise) {
        return false;
      }
      return result !== null;
    })();

  return {
    user,
    loading,
    isAuthenticated,
    inviteCode,
    isAdmin,
    displayName,
    emailVerified,
    login,
    register,
    join,
    logout,
    updateDisplayName,
    markEmailVerified,
    refreshEmailVerified,
    resendVerification,
  };
}
