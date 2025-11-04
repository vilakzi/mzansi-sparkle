import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Enable PWA in both dev and production for hot-reload and testing
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true, // Enable PWA in dev for hot-reload testing
        type: "module",
      },
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "zaBaddies_Online",
        short_name: "zaBaddies",
        description: "Share your best moments with zaBaddies_Online",
        theme_color: "#d946b8",
        background_color: "#180a1f",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg}"],
        // Increase cache size limits for videos
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100MB per file
        runtimeCaching: [
          {
            // Aggressive video caching - Cache First strategy for instant playback
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/posts-media\/.*\.(mp4|webm|mov)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "video-cache-v1",
              expiration: {
                maxEntries: 100, // Cache up to 100 videos
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              // Range request support for video streaming
              rangeRequests: true,
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    // Only cache successful responses
                    if (response.status === 200 || response.status === 206) {
                      return response;
                    }
                    return null;
                  },
                }
              ]
            }
          },
          {
            // Image caching
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*\.(jpg|jpeg|png|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache-v1",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // API calls - Network First with fallback to cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache-v1",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5 minutes
              },
              networkTimeoutSeconds: 10, // Fallback to cache after 10s
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Fonts and static assets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache-v1",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
              }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
