'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { configure, useAuth, useTranslation } from '@tt/core';
import styles from './login.module.scss';

configure('');

type Mode = 'login' | 'register' | 'join';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, join } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(() => searchParams.get('code') ?? '');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>(() => {
    const m = searchParams.get('mode');
    return m === 'join' || m === 'register' ? m : 'login';
  });
  const [error, setError] = useState('');
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  // After register/join: show "check your email" screen instead of going to /home.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const { resendVerification } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        router.replace('/home');
      } else if (mode === 'register') {
        await register(email, password, name.trim() || undefined);
        setPendingVerificationEmail(email);
      } else {
        await join(email, password, inviteCode, name.trim() || undefined);
        setPendingVerificationEmail(email);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  async function handleResend() {
    setResendLoading(true);
    try {
      await resendVerification();
      setResendSent(true);
      setTimeout(() => setResendSent(false), 4000);
    } catch {
      // silent — user can try again
    } finally {
      setResendLoading(false);
    }
  }

  // ── Check-email screen shown after successful register/join ───────────────
  if (pendingVerificationEmail) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.wordmark}>{t('auth.check_email_heading')}</h1>
          <p className={styles.tagline}>
            {t('auth.check_email_body', { email: pendingVerificationEmail })}
          </p>
          <button
            className={styles.submitBtn}
            onClick={handleResend}
            disabled={resendLoading || resendSent}
            type="button"
          >
            {resendSent
              ? t('auth.check_email_resent')
              : resendLoading
                ? '…'
                : t('auth.check_email_resend')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.wordmark}>{t('auth.title')}</h1>
        <p className={styles.tagline}>{t('auth.tagline')}</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className={styles.input}
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'join' && (
            <input
              className={styles.inviteInput}
              type="text"
              placeholder={t('auth.invite_code').toUpperCase()}
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              required
              maxLength={8}
              autoComplete="off"
            />
          )}
          {(mode === 'register' || mode === 'join') && (
            <input
              className={styles.input}
              type="text"
              placeholder={t('auth.your_name')}
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading
              ? '…'
              : mode === 'login'
                ? t('auth.sign_in')
                : mode === 'register'
                  ? t('auth.sign_up')
                  : t('auth.join')}
          </button>
        </form>

        {mode === 'login' ? (
          <>
            <button
              className={styles.switchLink}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              {t('auth.no_account')}
            </button>
            <button
              className={styles.switchLink}
              onClick={() => {
                setMode('join');
                setError('');
              }}
            >
              {t('auth.join_with_code')}
            </button>
          </>
        ) : (
          <button
            className={styles.switchLink}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            {t('auth.back_to_sign_in')}
          </button>
        )}
      </div>
    </main>
  );
}
