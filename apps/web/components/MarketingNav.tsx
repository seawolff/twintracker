'use client';
import { useTranslation } from '@tt/core';
import styles from './MarketingNav.module.scss';

interface MarketingNavProps {
  theme: 'day' | 'night';
  onToggle: () => void;
}

export function MarketingNav({ theme, onToggle }: MarketingNavProps) {
  const { t } = useTranslation();
  return (
    <nav className={styles.nav}>
      <a href="/" className={styles.logo}>
        {t('landing.logo')}
      </a>
      <div className={styles.navRight}>
        <button
          className={styles.themeBtn}
          onClick={onToggle}
          aria-label={t(theme === 'day' ? 'landing.toggle_night' : 'landing.toggle_day')}
        >
          {theme === 'day' ? '◑' : '◐'}
        </button>
        <a href="/login" className={styles.signIn}>
          {t('landing.sign_in')}
        </a>
      </div>
    </nav>
  );
}
