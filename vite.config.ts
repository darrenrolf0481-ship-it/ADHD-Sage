import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { maximumFileSizeToCacheInBytes: 5000000 },
      manifest: {
        name: 'ADHD Sage',
        short_name: 'ADHD Sage',
        description: 'ADHD Sage Sentinel App',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-512x512.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      // Vite watches .env and triggers a full server restart on change. Under
      // the hermes Node 26 build, that restart hits a ResetStdio EBADF crash
      // (node.cc:675) and takes Sage down until the watchdog respawns it.
      // Ignore .env so edits (e.g. adding keys) don't crash a live session.
      ignored: ['**/.env', '**/.env.*'],
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
