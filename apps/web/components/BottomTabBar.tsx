'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomTabBar.module.scss';

const tabs = [
  { href: '/home', icon: '⌂', label: 'Home' },
  { href: '/history', icon: '◷', label: 'History' },
  { href: '/settings', icon: '⚙', label: 'Settings' },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className={styles.bar} aria-label="Main navigation">
      {tabs.map(tab => {
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
    </nav>
  );
}
