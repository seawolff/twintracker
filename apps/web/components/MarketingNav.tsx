'use client';
import { useTranslation } from '@tt/core';
import { TwinsIcon } from './TwinsIcon';
import styles from './MarketingNav.module.scss';

interface MarketingNavProps {
  theme: 'day' | 'night';
  onToggle: () => void;
}

export function MarketingNav({ theme, onToggle }: MarketingNavProps) {
  const { t } = useTranslation();
  return (
    <nav className={styles.nav}>
      <div className={styles.navLeft}>
        <a href="/" className={styles.logo}>
          <TwinsIcon className={styles.brandMark} title={t('landing.logo')} />
          {t('landing.logo')}
        </a>
        <a href="/posts" className={styles.navLink}>
          {t('landing.posts')}
        </a>
      </div>
      <div className={styles.navRight}>
        <button
          className={styles.themeBtn}
          onClick={onToggle}
          aria-label={t(theme === 'day' ? 'landing.toggle_night' : 'landing.toggle_day')}
        >
          {theme === 'day' ? '◑' : '◐'}
        </button>
        <a
          href="/login"
          className={styles.signIn}
          data-umami-event="auth_sign_in_click"
          data-umami-event-location="marketing_nav"
        >
          {t('landing.sign_in')}
        </a>
      </div>
    </nav>
  );
}
