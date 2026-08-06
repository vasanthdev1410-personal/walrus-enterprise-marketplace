module.exports = {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@walrus/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@walrus/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@walrus/types$': '<rootDir>/../../packages/types/src/index.ts',
  },
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.spec.ts', '<rootDir>/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { diagnostics: { ignoreCodes: [151002] }, tsconfig: 'tsconfig.spec.json' },
    ],
  },
};
