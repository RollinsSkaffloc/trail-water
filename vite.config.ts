import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Trail Water',
        short_name: 'Trail Water',
        description: 'Offline hiking map with crowdsourced water reports',
        theme_color: '#17211b',
        background_color: '#17211b',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        runtimeCaching: [
          {
            // USGS topo tiles: the offline-area download writes into this same cache.
            urlPattern: ({ url }) => url.hostname === 'basemap.nationalmap.gov',
            handler: 'CacheFirst',
            options: {
              cacheName: 'topo-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 40000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Global base map: only lightly cached. OSM's tile policy forbids bulk downloads.
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
});
