/**
 * Root Admin Error Boundary
 * 
 * Catches and handles errors in the entire admin section
 * Provides a graceful fallback UI when errors occur
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error to console in development
        console.error('[Admin] Uncaught error:', error);

        // TODO: Send error to monitoring service (e.g., Sentry, DataDog)
        // reportErrorToMonitoring(error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
