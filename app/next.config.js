const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
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

  images: {
    // Allow Next.js Image component to load cup photos from PocketBase.
    // POCKETBASE_URL is set at build time in the Nix build, or via .env.local locally.
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.POCKETBASE_HOST || "pb.yourdomain.com",
      },
      {
        // Allow localhost for local development
        protocol: "http",
        hostname: "localhost",
        port: "8090",
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
