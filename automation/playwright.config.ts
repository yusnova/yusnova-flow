import { defineConfig, devices } from '@playwright/test'
import { configEnv, AUTH_STATE_FILE } from './bootstrap/config'

const isCI = Boolean(process.env['CI'])

export default defineConfig({
  testDir: './suites',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : 2,
  timeout: 35_000,
  expect: {
    timeout: 15_000,
  },

  reporter: [['html', { outputFolder: 'reports/html'}]],

  use: {
    headless: true,
    baseURL: configEnv.baseURL,
    trace: 'retain-on-first-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true
  },

  projects: [
    {
      name: 'setup',
      testDir: './bootstrap',
      testMatch: 'setup.ts',
    },
    {
      name: 'api',
      testMatch: '**/*.api.spec.ts',
    },
    {
      name: 'ui',
      testMatch: '**/*.ui.spec.ts',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE_FILE },
      dependencies: ['setup'],
    },
  ],

  outputDir: 'reports/artifacts',
});
