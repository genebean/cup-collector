"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/map",    label: "Map",    icon: "🗺️" },
  { href: "/browse", label: "Browse", icon: "📋" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

// Persistent bottom navigation bar — appears on all main screens.
// Uses safe-area padding so the bar clears the iPhone home indicator.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav fixed bottom-0 inset-x-0 bg-green-dark border-t border-green-mid z-50">
      <ul className="flex">
        {navItems.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "text-gold-DEFAULT"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <span className="text-xl leading-none">{icon}</span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
