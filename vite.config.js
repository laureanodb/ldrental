import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Fecha y hora (de Argentina) en que se armó esta versión, para mostrarla en la app.
const VERSION = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: { __VERSION__: JSON.stringify(VERSION) },
  build: {
    rollupOptions: {
      output: {
        // Supabase va aparte: casi nunca cambia, así el celular no lo vuelve a bajar en cada actualización.
        manualChunks: id => (id.includes('node_modules/@supabase/') || id.includes('node_modules/iceberg-js') ? 'supabase' : undefined),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'LD Rental',
        short_name: 'LD Rental',
        description: 'Autos, choferes, cobros y vencimientos en un solo lugar.',
        lang: 'es',
        theme_color: '#222b33',
        background_color: '#eef0ee',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Las librerías pesadas de PDF y Excel no se bajan al instalar: se guardan la primera vez que se usan.
        globIgnores: ['**/xlsx-*.js', '**/jspdf*.js', '**/html2canvas*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        navigateFallback: 'index.html',
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(xlsx|jspdf|html2canvas|purify\.es|index\.es)[-.][^/]*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'librerias', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
