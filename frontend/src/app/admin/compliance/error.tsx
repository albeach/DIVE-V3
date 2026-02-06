/**
 * Compliance Page Error Boundary
 * 
 * Catches errors specific to the admin compliance page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function ComplianceError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Compliance] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
