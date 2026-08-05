import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const isAndroidBuild = mode === 'android'

  return {
    base: isAndroidBuild ? './' : '/',
    define: {
      __ANDROID_BUILD__: JSON.stringify(isAndroidBuild),
    },
    build: {
      target: isAndroidBuild ? 'es2020' : 'es2023',
      modulePreload: !isAndroidBuild,
      rolldownOptions: isAndroidBuild
        ? {}
        : {
            output: {
              codeSplitting: {
                groups: [
                  {
                    name: 'supabase',
                    test: /node_modules[\\/]@supabase/,
                    priority: 20,
                  },
                  {
                    name: 'vendor',
                    test: /node_modules/,
                    minSize: 100_000,
                    maxSize: 300_000,
                    priority: 10,
                  },
                ],
              },
            },
          },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Android WebView data survives Play Store upgrades. Older releases
        // registered Workbox on Capacitor's localhost origin, so a cached
        // index.html could keep referencing JavaScript removed by the new APK.
        // The Android build replaces that worker with a self-destroying worker.
        // This clears Cache Storage without touching business records stored in
        // localStorage or IndexedDB.
        selfDestroying: isAndroidBuild,
        registerType: 'prompt',
        includeAssets: [
          'rabbits-foot-logo.png',
          'pwa-64x64.png',
          'apple-touch-icon-180x180.png',
        ],
        manifest: {
        name: "Rabbit's Foot Owner Hub",
        short_name: 'Owner Hub',
        description:
          "The private business workspace for Rabbit's Foot Handyman Services.",
        theme_color: '#10130f',
        background_color: '#10130f',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,webp,woff2}',
          ],
        },
      }),
    ],
  }
})
