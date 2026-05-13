import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4177);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  timeout: 45_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    reducedMotion: 'reduce',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects: [
    {
      name: 'mobile-chromium',
      testMatch: /mobile-interactions\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
    },
    {
      name: 'tablet-chromium',
      testMatch: /tablet-layout\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'chromium',
        viewport: { width: 834, height: 1194 },
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
