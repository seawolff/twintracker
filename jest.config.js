module.exports = {
  projects: [
    '<rootDir>/packages/ui/jest.config.js',
    {
      displayName: 'core',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/core/src/**/*.test.ts'],
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true, diagnostics: false }],
      },
    },
    {
      displayName: 'api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/api/src/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/api/tsconfig.json', diagnostics: false }],
      },
    },
  ],
};
