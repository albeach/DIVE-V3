"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { StandardsLensProvider } from "@/contexts/StandardsLensContext";
import { IdentityDrawerProvider } from "@/contexts/IdentityDrawerContext";
import { InstanceThemeProvider } from "@/components/ui/theme-provider";

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
    <InstanceThemeProvider>
      <StandardsLensProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider 
              refetchInterval={30}
              refetchOnWindowFocus={true}
              refetchWhenOffline={false}
            >
              <IdentityDrawerProvider>
                {children}
              </IdentityDrawerProvider>
            </SessionProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </StandardsLensProvider>
    </InstanceThemeProvider>
  );
}

