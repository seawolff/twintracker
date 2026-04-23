import { useTranslation } from '@tt/core';
import styles from './MarketingFooter.module.scss';

export function MarketingFooter() {
  const { t } = useTranslation();
  return (
    <footer className={styles.footer}>
      <a href="/posts" className={styles.link}>
        {t('landing.posts')}
      </a>
      <span className={styles.sep}>·</span>
      <a href="/privacy" className={styles.link}>
        {t('landing.privacy')}
      </a>
      <span className={styles.sep}>·</span>
      <a href="mailto:hello@twintracker.app" className={styles.link}>
        {t('landing.contact')}
      </a>
      <span className={styles.sep}>·</span>
      <span className={styles.copy}>
        {t('landing.copyright', { year: new Date().getFullYear() })}
      </span>
    </footer>
  );
}
