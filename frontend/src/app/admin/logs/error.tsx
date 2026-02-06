/**
 * Logs Page Error Boundary
 * 
 * Catches errors specific to the admin logs page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function LogsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Logs] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
