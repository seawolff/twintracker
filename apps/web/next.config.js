/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['react-native', 'react-native-web', 'react-native-svg', '@tt/core', '@tt/ui'],
  experimental: {
    externalDir: true,
  },
  webpack: config => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
      'react-native-gesture-handler': false, // native-only — HistoryFeed.web.tsx must be used instead
      '@react-native/assets-registry': false, // native asset pipeline — not needed on web
      'expo-font': false, // native font loading — web uses next/font/google instead
    };
    // Prefer .web.tsx/.web.ts files over native equivalents
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      ...config.resolve.extensions,
    ];
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
