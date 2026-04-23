'use client';

import { useState } from 'react';
import { WaitlistModal } from './WaitlistModal';
import styles from './PostsWaitlistCta.module.scss';

export function PostsWaitlistCta() {
  const [open, setOpen] = useState(false);

  const track = (event: string, data?: Record<string, unknown>) => {
    if (typeof window !== 'undefined') {
      (window as Window & { umami?: { track?: (event: string, data?: Record<string, unknown>) => void } })
        .umami?.track?.(event, data);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    track('posts_waitlist_open', { location: 'article_inline_cta' });
  };

  return (
    <>
      <section className={styles.card}>
        <p className={styles.kicker}>TwinTracker</p>
        <h2 className={styles.title}>Keep the whole twin day straight without guessing.</h2>
        <p className={styles.body}>
          Track feeds, naps, bedtime timing, and what each child needs next with a twins-first
          baby tracker.
        </p>
        <div className={styles.actions}>
          <a
            href="/login?mode=register"
            className={styles.button}
            data-umami-event="posts_start_tracking_click"
            data-umami-event-location="article_inline_cta"
            onClick={() =>
              track('auth_start_tracking_click', {
                location: 'article_inline_cta',
                mode: 'register',
              })
            }
          >
            Start tracking on web
          </a>
          <button
            className={styles.secondaryButton}
            onClick={handleOpen}
          >
            Join the app waitlist
          </button>
        </div>
      </section>
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </>
  );
}
