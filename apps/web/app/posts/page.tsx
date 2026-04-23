import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFrame } from '../../components/MarketingFrame';
import { UmamiEvent } from '../../components/UmamiEvent';
import { getAllPosts } from './content';
import { BASE_URL, SITE_NAME } from '../site';
import styles from './posts.module.scss';

export const metadata: Metadata = {
  title: 'Twin Parenting Posts',
  description:
    'TwinTracker posts on twin sleep schedules, feeding rhythms, newborn routines, and the systems that make life with multiples more manageable.',
  alternates: {
    canonical: `${BASE_URL}/posts`,
  },
  openGraph: {
    title: `Twin Parenting Posts | ${SITE_NAME}`,
    description:
      'Twin sleep, feeding, and routine posts from the team behind TwinTracker.',
    url: `${BASE_URL}/posts`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Twin Parenting Posts | ${SITE_NAME}`,
    description:
      'Twin sleep, feeding, and routine posts from the team behind TwinTracker.',
  },
  keywords: [
    'twin parenting blog',
    'twin sleep schedule',
    'twin baby routine',
    'sleep training twins',
    'twin feeding schedule',
  ],
};

export default function PostsIndexPage() {
  const allPosts = getAllPosts();
  const [featuredPost, ...otherPosts] = allPosts;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'TwinTracker Posts',
    url: `${BASE_URL}/posts`,
    description:
      'Twin sleep, feeding, and schedule posts from the team behind TwinTracker.',
    blogPost: allPosts.map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      url: `${BASE_URL}/posts/${post.slug}`,
      description: post.description,
    })),
  };

  return (
    <MarketingFrame>
      <UmamiEvent event="posts_index_view" data={{ path: '/posts' }} />
      <div className={styles.shell}>
        <main className={styles.container}>
          {/* eslint-disable-next-line react/no-danger */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <section className={styles.hero}>
            <div className={styles.heroPanel}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>Posts</p>
                <h1 className={styles.heroTitle}>Twin parenting systems worth saving.</h1>
                <p className={styles.heroBody}>
                  Search-focused, practical posts about twin sleep, routines, feeding rhythms,
                  and the real systems that make day-to-day life with multiples feel calmer.
                </p>
              </div>
              <div className={styles.heroAside}>
                <p className={styles.heroStatLabel}>Inside the posts</p>
                <p className={styles.heroStatValue}>Twin sleep, routines, feeding, and real-world systems</p>
                <p className={styles.heroStatBody}>
                  Built from actual TwinTracker usage, founder experience, and the same logic
                  patterns that shape the app itself.
                </p>
              </div>
            </div>
          </section>

          {featuredPost && (
            <section className={styles.featuredSection}>
              <article className={styles.featuredCard}>
                <div className={styles.cardMeta}>
                  <span>Featured post</span>
                  <span>{featuredPost.category}</span>
                  <span>{featuredPost.readTime}</span>
                  <span>{featuredPost.publishedAt}</span>
                </div>
                <h2 className={styles.featuredTitle}>
                  <Link
                    href={`/posts/${featuredPost.slug}`}
                    data-umami-event="posts_article_click"
                    data-umami-event-location="featured_title"
                    data-umami-event-slug={featuredPost.slug}
                  >
                    {featuredPost.title}
                  </Link>
                </h2>
                <p className={styles.featuredExcerpt}>{featuredPost.excerpt}</p>
                <Link
                  href={`/posts/${featuredPost.slug}`}
                  className={styles.featuredLink}
                  data-umami-event="posts_article_click"
                  data-umami-event-location="featured_cta"
                  data-umami-event-slug={featuredPost.slug}
                >
                  Read the featured post
                </Link>
              </article>
            </section>
          )}

          {otherPosts.length > 0 && (
            <section className={styles.grid}>
              {otherPosts.map(post => (
                <article key={post.slug} className={styles.card}>
                  <div className={styles.cardMeta}>
                    <span>{post.category}</span>
                    <span>{post.readTime}</span>
                    <span>{post.publishedAt}</span>
                  </div>
                  <h2 className={styles.cardTitle}>
                    <Link
                      href={`/posts/${post.slug}`}
                      data-umami-event="posts_article_click"
                      data-umami-event-location="card_title"
                      data-umami-event-slug={post.slug}
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <p className={styles.cardExcerpt}>{post.excerpt}</p>
                  <Link
                    href={`/posts/${post.slug}`}
                    className={styles.cardLink}
                    data-umami-event="posts_article_click"
                    data-umami-event-location="card_cta"
                    data-umami-event-slug={post.slug}
                  >
                    Read post
                  </Link>
                </article>
              ))}
            </section>
          )}
        </main>
      </div>
    </MarketingFrame>
  );
}
