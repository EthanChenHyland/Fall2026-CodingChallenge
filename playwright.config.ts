import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3199',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'rm -f /tmp/mosaic-e2e.sqlite /tmp/mosaic-e2e.sqlite-shm /tmp/mosaic-e2e.sqlite-wal && npm run build && PORT=3199 DATABASE_PATH=/tmp/mosaic-e2e.sqlite npm start',
    url: 'http://127.0.0.1:3199/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
