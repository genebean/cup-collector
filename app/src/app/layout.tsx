import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cup Collector",
  description: "Track your Starbucks location cup collection",
  manifest: "/manifest.json",
  // Apple-specific PWA meta tags — required for "Add to Home Screen" on iPhone
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cup Collector",
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
        {/* Apple touch icon — same 192px icon as PWA manifest and PocketID registration */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={inter.className}>
        {/* Providers wraps everything in SessionProvider and QueryClientProvider */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
