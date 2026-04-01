'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SettingsIcon } from '@tt/ui';
import styles from './BottomTabBar.module.scss';

const textTabs = [
  { href: '/home', icon: '⌂', label: 'Home' },
  { href: '/history', icon: '◷', label: 'History' },
];

export function BottomTabBar() {
  const pathname = usePathname();

  const isSettingsActive =
    pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <nav className={styles.bar} aria-label="Main navigation">
      {textTabs.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
          >
            <span className={styles.icon} aria-hidden="true">
              {tab.icon}
            </span>
          </Link>
        );
      })}
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={isSettingsActive ? 'page' : undefined}
        className={`${styles.tab} ${isSettingsActive ? styles.tabActive : ''}`}
      >
        <span className={styles.icon} aria-hidden="true">
          <SettingsIcon size={20} />
        </span>
      </Link>
    </nav>
  );
}
