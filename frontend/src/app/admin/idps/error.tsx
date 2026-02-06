/**
 * Identity Providers Page Error Boundary
 * 
 * Catches errors specific to the admin IdPs page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function IdpsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[IdPs] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
