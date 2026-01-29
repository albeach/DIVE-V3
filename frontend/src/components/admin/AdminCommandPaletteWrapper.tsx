/**
 * Admin Command Palette Wrapper
 *
 * Client component that renders the GlobalCommandPalette for admin pages
 * Uses session data to provide user context
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import { useSession } from 'next-auth/react';
import GlobalCommandPalette from '@/components/admin/GlobalCommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';

export function AdminCommandPaletteWrapper() {
  const { data: session } = useSession();

  // Initialize command palette with keyboard shortcuts
  useCommandPalette();

  // Determine instance type from environment or session
  const instanceType = (process.env.NEXT_PUBLIC_INSTANCE_TYPE as 'hub' | 'spoke') || 'hub';

  return (
    <GlobalCommandPalette
      user={{
        roles: session?.user?.roles || [],
        clearance: session?.user?.clearance,
        countryOfAffiliation: session?.user?.countryOfAffiliation,
      }}
      instanceType={instanceType}
    />
  );
}
