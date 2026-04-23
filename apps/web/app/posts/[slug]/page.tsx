import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingFrame } from '../../../components/MarketingFrame';
import { PostsWaitlistCta } from '../../../components/PostsWaitlistCta';
import { TikTokEmbed } from '../../../components/TikTokEmbed';
import { UmamiEvent } from '../../../components/UmamiEvent';
import {
  author,
  buildArticleBody,
  getAllPosts,
  getPostBySlug,
  getPostUrl,
  publisher,
} from '../content';
import { BASE_URL, SITE_NAME } from '../../site';
import styles from '../posts.module.scss';

type PageProps = {
  params: { slug: string };
};

function buildPostMetadata(slug: string): Metadata {
  const post = getPostBySlug(slug);
  if (!post) {
    return {};
  }
  const url = getPostUrl(post.slug);
  const ogImageUrl = `${url}/opengraph-image`;
  return {
    title: post.seoTitle,
    description: post.description,
    alternates: {
      canonical: url,
    },
    keywords: post.keywords,
    authors: [{ name: author.name }],
    openGraph: {
      type: 'article',
      url,
      siteName: SITE_NAME,
      title: post.seoTitle,
      description: post.description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [author.name],
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle,
      description: post.description,
      images: [ogImageUrl],
    },
  };
}

export function generateMetadata({ params }: PageProps): Metadata {
  return buildPostMetadata(params.slug);
}

export function generateStaticParams() {
  return getAllPosts().map(post => ({ slug: post.slug }));
}

export default function PostPage({ params }: PageProps) {
  const post = getPostBySlug(params.slug);
  if (!post) {
    notFound();
  }

  const url = getPostUrl(post.slug);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: url,
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author,
    publisher,
    image: `${url}/opengraph-image`,
    articleSection: post.category,
    keywords: post.keywords.join(', '),
    articleBody: buildArticleBody(post),
    isPartOf: {
      '@type': 'Blog',
      name: 'TwinTracker Posts',
      url: `${BASE_URL}/posts`,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Posts', item: `${BASE_URL}/posts` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <MarketingFrame>
      <UmamiEvent
        event="post_article_view"
        data={{ slug: post.slug, category: post.category, path: `/posts/${post.slug}` }}
      />
      <div className={styles.shell}>
        <main className={styles.container}>
          {/* eslint-disable-next-line react/no-danger */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
          />
          {/* eslint-disable-next-line react/no-danger */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
          />
          {/* eslint-disable-next-line react/no-danger */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
          />

          <article className={styles.article}>
            <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              <Link href="/posts">Posts</Link>
              <span>/</span>
              <span>{post.category}</span>
            </nav>

            <header className={styles.articleHero}>
              <div className={styles.articleMeta}>
                <span>{post.category}</span>
                <span>{post.readTime}</span>
                <span>{post.publishedAt}</span>
              </div>
              <h1 className={styles.articleTitle}>{post.title}</h1>
              <div className={styles.byline}>
                <img src="/wolff.jpg" alt="Chris Wolff" className={styles.bylineAvatar} />
                <div>
                  <p className={styles.bylineName}>By Chris Wolff</p>
                  <p className={styles.bylineMeta}>Founder of TwinTracker · twin dad</p>
                </div>
              </div>
              <p className={styles.articleDeck}>{post.description}</p>
              {post.heroNote && <p className={styles.heroNote}>{post.heroNote}</p>}
              {post.tiktokUrl && (
                <p className={styles.heroNote}>
                  Original TikTok:{' '}
                  <a
                    href={post.tiktokUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-umami-event="post_tiktok_click"
                    data-umami-event-location="article_hero"
                    data-umami-event-slug={post.slug}
                  >
                    watch the post on TikTok
                  </a>
                </p>
              )}
            </header>

            <div className={styles.content}>
              <section className={styles.intro}>
                {post.intro.map(paragraph => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>

              {post.tiktokUrl && post.tiktokEmbedUrl && (
                <TikTokEmbed
                  embedUrl={post.tiktokEmbedUrl}
                  permalink={post.tiktokUrl}
                  title={post.title}
                />
              )}

              {post.sections.map(section => (
                <section key={section.title} className={styles.section}>
                  <h2 className={styles.sectionTitle}>{section.title}</h2>
                  {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul className={styles.bullets}>
                      {section.bullets.map(bullet => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {section.callout && (
                    <div className={styles.callout}>
                      <p>{section.callout}</p>
                    </div>
                  )}
                  {section.feature && (
                    <aside className={styles.featureCallout}>
                      <p className={styles.featureLabel}>TwinTracker Feature</p>
                      <p>{section.feature}</p>
                    </aside>
                  )}
                </section>
              ))}

              {post.images?.map(image => (
                <figure key={image.src} className={styles.imageFigure}>
                  <img src={image.src} alt={image.alt} className={styles.imageFrame} />
                  <figcaption className={styles.imageCaption}>{image.caption}</figcaption>
                </figure>
              ))}

              <PostsWaitlistCta />

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
                <div className={styles.faqBlock}>
                  {post.faq.map(item => (
                    <div key={item.question} className={styles.faqItem}>
                      <h3 className={styles.faqQuestion}>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </section>

              <Link
                href="/posts"
                className={styles.backLink}
                data-umami-event="post_back_to_posts_click"
                data-umami-event-slug={post.slug}
              >
                Back to all posts
              </Link>
            </div>
          </article>
        </main>
      </div>
    </MarketingFrame>
  );
}
