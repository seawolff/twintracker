import type { MetadataRoute } from 'next';
import { getAllPosts } from './posts/content';
import { BASE_URL } from './site';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/posts',
    '/privacy',
    '/login',
    '/join',
    '/verify-email',
  ].map(path => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' || path === '/posts' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/posts' ? 0.9 : 0.6,
  }));

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map(post => ({
    url: `${BASE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...postRoutes];
}
