/** @type {import('next').NextConfig} */
// Expose the app version to the browser so the API client can send X-App-Version.
// Set from package.json version at build time.
const { version } = require('./package.json');

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  output: 'standalone',
  transpilePackages: [
    'react-native',
    'react-native-web',
    'react-native-svg',
    '@tt/core',
    '@tt/ui',
    '@react-oauth/google',
  ],
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
      '@react-native-community/datetimepicker': false, // native-only — LogSheet.web.tsx used instead
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
};

module.exports = nextConfig;
