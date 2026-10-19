import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === 'win32' ? 'chrome' : undefined),
  },
  webServer: [
    {
      command: 'node scripts/astro.mjs dev --host 127.0.0.1 --port 4321',
      url: 'http://127.0.0.1:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'node --import tsx scripts/serve-test-site.ts',
      url: 'http://127.0.0.1:4322',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
