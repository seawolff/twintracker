'use client';

import styles from './TikTokEmbed.module.scss';

interface TikTokEmbedProps {
  embedUrl: string;
  permalink: string;
  title: string;
}

export function TikTokEmbed({ embedUrl, permalink, title }: TikTokEmbedProps) {
  return (
    <figure className={styles.wrap}>
      <div className={styles.frame}>
        <iframe
          src={embedUrl}
          title={title}
          allow="encrypted-media;"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <figcaption className={styles.caption}>
        This article expands on the original TikTok:{" "}
        <a
          href={permalink}
          target="_blank"
          rel="noreferrer"
          data-umami-event="post_tiktok_click"
          data-umami-event-url={permalink}
        >
          {title}
        </a>
      </figcaption>
    </figure>
  );
}
