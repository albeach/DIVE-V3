"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider 
      refetchInterval={0} // Disable automatic session refetch
      refetchOnWindowFocus={false} // CRITICAL: Prevent session restoration after logout
    >
      {children}
    </SessionProvider>
  );
}

