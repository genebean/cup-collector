import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Cup Collector",
  description: "Track your Starbucks location cup collection",
  manifest: "/manifest.json",
  // Apple-specific PWA meta tags — required for "Add to Home Screen" on iPhone
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cup Collector",
    startupImage: [
      // iPhone SE (1st gen)
      { url: "/icons/splash/splash-640x1136.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone 6/7/8/SE 2nd+3rd gen
      { url: "/icons/splash/splash-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone 6+/7+/8+
      { url: "/icons/splash/splash-1242x2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone X/XS/11 Pro
      { url: "/icons/splash/splash-1125x2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone XR/11
      { url: "/icons/splash/splash-828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone XS Max/11 Pro Max
      { url: "/icons/splash/splash-1242x2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12 Mini/13 Mini
      { url: "/icons/splash/splash-1080x2340.png", media: "(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12/12 Pro/13/13 Pro/14/15
      { url: "/icons/splash/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12 Pro Max/13 Pro Max/14 Plus/15 Plus
      { url: "/icons/splash/splash-1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 14 Pro/15/15 Pro
      { url: "/icons/splash/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 14 Pro Max/15 Pro Max
      { url: "/icons/splash/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPad 9.7" / Air 2 / mini
      { url: "/icons/splash/splash-1536x2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPad Air 10.5" (3rd gen)
      { url: "/icons/splash/splash-1668x2224.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPad Pro 11" / Air 11" M2
      { url: "/icons/splash/splash-1668x2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPad Pro 12.9"
      { url: "/icons/splash/splash-2048x2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
};

export const viewport: Viewport = {
  // Matches the PWA manifest theme_color
  themeColor: "#1E3932",
  width: "device-width",
  initialScale: 1,
  // Prevents zoom on input focus on iOS — important for mobile UX
  maximumScale: 1,
  userScalable: false,
  // Respect safe areas for notch/home indicator
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Apple touch icon — 180px full-bleed (maskable) so iOS squircle clip has no black corners */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        {/* Providers wraps everything in SessionProvider and QueryClientProvider */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
