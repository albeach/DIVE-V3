/**
 * Certificates Page Error Boundary
 * 
 * Catches errors specific to the admin certificates page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function CertificatesError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Certificates] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
