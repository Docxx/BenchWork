import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and reads TAURI_ENV_* variables.
// TAURI_DEV_HOST is set only for device builds (Android), which must reach
// the server over Wi-Fi. Otherwise listen on loopback only, so Node never
// accepts network connections.
const host = process.env['TAURI_DEV_HOST'];
const LOOPBACK = '127.0.0.1';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      // Frappe Gantt lists its stylesheet only under a "style" export condition.
      'frappe-gantt/style.css': fileURLToPath(
        new URL('./node_modules/frappe-gantt/dist/frappe-gantt.css', import.meta.url),
      ),
    },
  },
  // Loaded only when first used, so Vite would otherwise find them mid-session
  // and bundle them then, reloading the page.
  optimizeDeps: {
    include: ['plotly.js-dist-min', 'frappe-gantt', 'markmap-view', '@xyflow/react'],
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? LOOPBACK,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    sourcemap: Boolean(process.env['TAURI_ENV_DEBUG']),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'spikes/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Starting many jsdom workers at once on a busy Windows PC can exceed
    // Vitest's fixed 60 s worker start-up limit; four is also the fastest here.
    maxWorkers: 4,
  },
});
