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
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
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
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/posts-media\/.*\.(mp4|webm|mov)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "video-cache-v1",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    if (response.status === 200 || response.status === 206) return response;
                    return null;
                  },
                }
              ]
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*\.(jpg|jpeg|png|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache-v1",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache-v1",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache-v1",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — tiny, always needed
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Data layer — React Query + Supabase
          "vendor-data": ["@tanstack/react-query", "@supabase/supabase-js"],
          // Heavy chart library — only loaded on /analytics
          "vendor-charts": ["recharts"],
          // Date utilities
          "vendor-date": ["date-fns"],
          // Radix UI primitives (shadcn foundation)
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-avatar",
            "@radix-ui/react-sheet",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-select",
            "@radix-ui/react-switch",
            "@radix-ui/react-slider",
          ],
        },
      },
    },
    // Warn if any single chunk exceeds 500KB
    chunkSizeWarningLimit: 500,
  },
}));
