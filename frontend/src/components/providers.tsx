"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider 
      refetchInterval={30} // FIX #5: Re-enable session refetch every 30 seconds for state sync
      refetchOnWindowFocus={true} // FIX #5: Re-enable focus refetch for better UX
      refetchWhenOffline={false} // Don't refetch when offline (saves bandwidth)
    >
      {children}
    </SessionProvider>
  );
}

