/**
 * Analytics Page Error Boundary
 * 
 * Catches errors specific to the admin analytics page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function AnalyticsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Analytics] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
