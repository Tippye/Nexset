/** Node-environment tests for the data layer and pure logic (no RN runtime needed). */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  transformIgnorePatterns: ['node_modules/(?!(drizzle-orm)/)'],
};
