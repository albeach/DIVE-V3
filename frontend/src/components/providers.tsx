"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { StandardsLensProvider } from "@/contexts/StandardsLensContext";

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
    <StandardsLensProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider 
            refetchInterval={30} // FIX #5: Re-enable session refetch every 30 seconds for state sync
            refetchOnWindowFocus={true} // FIX #5: Re-enable focus refetch for better UX
            refetchWhenOffline={false} // Don't refetch when offline (saves bandwidth)
          >
            {children}
          </SessionProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </StandardsLensProvider>
  );
}

