module.exports = {
  testEnvironment: 'node',
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
  // Do not attempt to transform node_modules (all dependencies are mocked below)
  transformIgnorePatterns: ['node_modules/'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/jest/react-native.tsx',
    '^react-native-gesture-handler.*$': '<rootDir>/jest/gesture-handler.ts',
    '^react-native-svg$': '<rootDir>/jest/svg.ts',
    '^.*/BabyIcons$': '<rootDir>/jest/baby-icons.ts',
    '^@tt/core$': '<rootDir>/jest/tt-core.ts',
  },
  testMatch: ['**/__tests__/**/*.test.tsx'],
};
