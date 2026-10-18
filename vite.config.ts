/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /judya-app/ (BRIEF 3.5).
const BASE = '/judya-app/';

// Shown at the bottom of Settings so the owner can tell which build is running: package version + short commit.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev'; // not a git checkout
  }
})();
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(`${version} (${commit})`) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version waits until the person taps "โหลดใหม่" (BRIEF 3.4), never reloads mid-form.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/judya-appicon.svg'],
      manifest: {
        name: 'JudYa',
        short_name: 'JudYa',
        description: 'จัดยาได้ ดูแลได้ทุกวัน',
        lang: 'th',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        theme_color: '#1A73E8',
        background_color: '#F8F9FA',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app and the fonts so it opens in airplane mode (BRIEF 3.4).
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
