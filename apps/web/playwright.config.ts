import { defineConfig, devices } from '@playwright/test';

// Requires the API (seeded, PAYMENT_PROVIDER=dev) on :4000 and the web app on :3000.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', use: { ...devices['Pixel 7'] } },
  ],
});
