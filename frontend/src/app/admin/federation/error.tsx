/**
 * Federation Page Error Boundary
 * 
 * Catches errors specific to the admin federation page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function FederationError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Federation] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
