/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  testTimeout: 120000,
  maxWorkers: 1,
  testSequencer: '<rootDir>/e2e/sequencer.js',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  setupFiles: ['<rootDir>/e2e/setup-env.js'],
  setupFilesAfterEnv: ['<rootDir>/e2e/setup-after-env.js'],
  verbose: true,
};
