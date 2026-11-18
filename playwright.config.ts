import { defineConfig, devices } from '@playwright/test';

// UI flows run against a Vite dev server with the in-memory platform adapter.
// It uses its own port so it never reuses a `pnpm tauri dev` server on 1420.
const PORT = 1430;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // On CI, a failed test gets one more try; one that then passes is still
  // listed as flaky, so it can be fixed without blocking the run.
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${String(PORT)}`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    env: { VITE_PLATFORM: 'memory', VITE_PERSONAL: '1' },
  },
});
