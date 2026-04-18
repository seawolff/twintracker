module.exports = {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: { jsx: 'react-jsx', esModuleInterop: true },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/'],
  testMatch: ['<rootDir>/components/__tests__/**/*.test.tsx'],
};
