import { fileURLToPath, URL } from 'node:url';
import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and reads TAURI_ENV_* variables.
// TAURI_DEV_HOST is set only for device builds (Android), which must reach
// the server over Wi-Fi. Otherwise listen on loopback only, so Node never
// accepts network connections.
const host = process.env['TAURI_DEV_HOST'];
const LOOPBACK = '127.0.0.1';
const labelOnly = process.env['BENCHWORK_LABEL_STUDIO'] === '1';
// Personal modules (src/personal), and the label page that goes with them,
// are built in only on a device whose .env.local sets VITE_PERSONAL=1.
const personal = loadEnv('', process.cwd(), 'VITE_')['VITE_PERSONAL'] === '1';

let buildId = 'development';
try {
  buildId = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
    buildId += '-modified';
} catch {
  /* Source archives may not contain Git history. */
}

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId) },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
    },
  },
  // Loaded only when first used, so Vite would otherwise find them mid-session
  // and bundle them then, reloading the page.
  optimizeDeps: {
    include: ['plotly.js-dist-min', 'markmap-view', '@xyflow/react'],
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
    outDir: labelOnly ? 'dist-labels' : 'dist',
    rolldownOptions: {
      input: labelOnly
        ? { labels: fileURLToPath(new URL('./labels.html', import.meta.url)) }
        : {
            main: fileURLToPath(new URL('./index.html', import.meta.url)),
            audience: fileURLToPath(new URL('./audience.html', import.meta.url)),
            ...(personal
              ? { labels: fileURLToPath(new URL('./labels.html', import.meta.url)) }
              : {}),
          },
    },
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
