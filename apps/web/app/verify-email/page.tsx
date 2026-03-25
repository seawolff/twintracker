'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { configure, api, useTranslation } from '@tt/core';
import styles from './verify-email.module.scss';

configure('');

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  // Prevent React 18 Strict Mode double-invocation from consuming the token twice.
  const called = useRef(false);

  useEffect(() => {
    if (called.current) {
      return;
    }
    called.current = true;
    if (!token) {
      setStatus('error');
      return;
    }
    api.auth
      .verifyEmail(token)
      .then(() => {
        // Persist verified state so the banner disappears immediately on return to app.
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('tt_email_verified', 'true');
        }
        setStatus('success');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.spinner} />
        </div>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.heading}>{t('auth.verify_success_heading')}</h1>
          <p className={styles.body}>{t('auth.verify_success_body')}</p>
          <button
            className={styles.btn}
            onClick={() => {
              window.location.href = 'twintracker://';
            }}
            type="button"
          >
            {t('auth.verify_open_native_app')}
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => router.replace('/home')}
            type="button"
          >
            {t('auth.verify_continue_browser')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>{t('auth.verify_error_heading')}</h1>
        <p className={styles.body}>{t('auth.verify_error_body')}</p>
        <button className={styles.btn} onClick={() => router.replace('/home')} type="button">
          {t('auth.verify_error_cta')}
        </button>
      </div>
    </main>
  );
}
