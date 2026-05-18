import nextPWA from "@ducanh2912/next-pwa";

const withPWA = nextPWA({
  dest: "public",
  // Disable the PWA service worker in dev — avoids injecting the workbox webpack
  // plugin, which conflicted with Next.js 16 and forced Turbopack on. The SW is
  // only useful in production anyway (offline caching, installability).
  disable: process.env.NODE_ENV === "development",
  // Network First for API/data routes — always try live data, fall back to cache
  // Cache First for static assets — icons, fonts, cup images load fast offline
  runtimeCaching: [
    {
      // PocketBase API and Next.js API routes — network first
      urlPattern: /\/(api|_pocketbase)\//,
      handler: "NetworkFirst",
      options: { cacheName: "api-cache", expiration: { maxAgeSeconds: 60 } },
    },
    {
      // Cup images from PocketBase — cache first (they rarely change)
      urlPattern: /\/api\/files\//,
      handler: "CacheFirst",
      options: {
        cacheName: "cup-images",
        expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output is required for the Nix build — produces a self-contained
  // Node server that doesn't need node_modules at runtime.
  output: "standalone",

  // Allow Playwright's 127.0.0.1 origin and any extra dev origin (e.g. Tailscale
  // IP for mobile testing) to access Next.js dev resources. Set NEXT_DEV_ORIGIN in
  // the shell when running dev-next-https or dev-next-network.
  allowedDevOrigins: ["127.0.0.1", ...(process.env.NEXT_DEV_ORIGIN ? [process.env.NEXT_DEV_ORIGIN] : [])],

  images: {
    // Allow Next.js Image component to load cup photos from PocketBase.
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.POCKETBASE_HOST || "pb.yourdomain.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8090",
      },
    ],
  },
};

export default withPWA(nextConfig);
