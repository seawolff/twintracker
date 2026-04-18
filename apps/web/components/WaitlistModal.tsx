'use client';
import { useState } from 'react';
import { useTranslation } from '@tt/core';
import styles from './WaitlistModal.module.scss';

type Platform = 'ios' | 'android' | 'both' | null;

interface WaitlistModalProps {
  onClose: () => void;
}

/** Read a single UTM param from the current URL safely (SSR-friendly). */
function getUtmParam(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search).get(key);
}

export function WaitlistModal({ onClose }: WaitlistModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState<Platform>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          platform,
          source: 'landing',
          utmSource: getUtmParam('utm_source'),
          utmMedium: getUtmParam('utm_medium'),
          utmCampaign: getUtmParam('utm_campaign'),
        }),
      });
      if (!res.ok) {
        throw new Error('server error');
      }
      // Track waitlist conversion in Umami
      (
        window as Window & { umami?: { track: (event: string, data?: object) => void } }
      ).umami?.track('waitlist_signup', { platform: platform ?? 'unspecified' });
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    // Backdrop — click outside to close
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('landing.waitlist_close')}
        >
          ✕
        </button>

        {status === 'success' ? (
          <div className={styles.success}>
            <p className={styles.successTitle}>{t('landing.waitlist_success_title')}</p>
            <p className={styles.successBody}>{t('landing.waitlist_success_body')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h2 className={styles.title}>{t('landing.waitlist_title')}</h2>
            <p className={styles.body}>{t('landing.waitlist_body')}</p>

            <input
              className={styles.input}
              type="email"
              required
              placeholder={t('landing.waitlist_email_placeholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />

            <p className={styles.platformLabel}>{t('landing.waitlist_platform_label')}</p>
            <div className={styles.platformPills}>
              {(['ios', 'android', 'both'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.pill} ${platform === p ? styles.pillActive : ''}`}
                  onClick={() => setPlatform(prev => (prev === p ? null : p))}
                >
                  {t(`landing.waitlist_platform_${p}`)}
                </button>
              ))}
            </div>

            {status === 'error' && <p className={styles.errorMsg}>{t('landing.waitlist_error')}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!email || status === 'loading'}
            >
              {status === 'loading' ? '…' : t('landing.waitlist_submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
