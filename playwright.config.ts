import { defineConfig, devices } from '@playwright/test';

// UI flows run against a Vite dev server with the in-memory platform adapter.
// It uses its own port so it never reuses a `pnpm tauri dev` server on 1420.
const PORT = 1430;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${String(PORT)}`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
    env: { VITE_PLATFORM: 'memory' },
  },
});
