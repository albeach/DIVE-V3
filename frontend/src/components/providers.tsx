"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { StandardsLensProvider } from "@/contexts/StandardsLensContext";
import { IdentityDrawerProvider } from "@/contexts/IdentityDrawerContext";
import { PolicyProvider } from "@/contexts/PolicyContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { InstanceThemeProvider } from "@/components/ui/theme-provider";
// TEMPORARY: ThemeProvider disabled until container rebuild picks up next-themes
// import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance (only once per component lifecycle)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
        retry: 3,
        refetchOnWindowFocus: false
      }
    }
  }));

  return (
    // <ThemeProvider> {/* TEMPORARY: Disabled - enable after container rebuild */}
      <InstanceThemeProvider>
        <StandardsLensProvider>
          <LocaleProvider>
            <QueryClientProvider client={queryClient}>
              <SessionProvider
                refetchInterval={5 * 60}
                refetchOnWindowFocus={false}
                refetchWhenOffline={false}
              >
                <PolicyProvider>
                  <IdentityDrawerProvider>
                    <CommandPaletteProvider>
                      {children}
                      <Toaster position="top-right" richColors />
                    </CommandPaletteProvider>
                  </IdentityDrawerProvider>
                </PolicyProvider>
              </SessionProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </StandardsLensProvider>
    </InstanceThemeProvider>
    // </ThemeProvider> {/* TEMPORARY: Disabled - enable after container rebuild */}
  );
}
