"use client";

// Wraps the app in the providers that require client-side context:
//   - SessionProvider: makes Auth.js session available via useSession()
//   - QueryClientProvider: makes React Query available for data fetching + caching
//   - UiThemeInitializer: applies .dark class to <html> based on stored preference
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useUiTheme } from "@/hooks/useUiTheme";

// Renders nothing — exists only to call useUiTheme so the .dark class is applied
// on every page, not just when the Settings screen is mounted.
function UiThemeInitializer() {
  useUiTheme();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Create the QueryClient inside useState so it's unique per browser tab
  // and not shared between server renders
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 30 seconds — avoids redundant refetches
            // when navigating between screens
            staleTime: 30 * 1000,
            // Keep cached data for 5 minutes after a component unmounts
            gcTime: 5 * 60 * 1000,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <UiThemeInitializer />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
