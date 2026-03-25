'use client';
import { useState } from 'react';
import { useAuth, useTranslation } from '@tt/core';
import styles from './EmailVerificationBanner.module.scss';

/** Thin banner shown to users who haven't verified their email yet. */
export function EmailVerificationBanner() {
  const { emailVerified, resendVerification } = useAuth();
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only show if explicitly false — null means unknown (no need to bother user).
  if (emailVerified !== false) {
    return null;
  }

  async function handleResend() {
    setLoading(true);
    try {
      await resendVerification();
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.text}>{t('auth.verify_banner')}</span>
      <button
        className={styles.btn}
        onClick={handleResend}
        disabled={loading || sent}
        type="button"
      >
        {sent ? t('auth.verify_banner_resent') : loading ? '…' : t('auth.verify_banner_resend')}
      </button>
    </div>
  );
}
