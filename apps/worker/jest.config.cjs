/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@tenantguard/db$': '<rootDir>/../../packages/db/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
