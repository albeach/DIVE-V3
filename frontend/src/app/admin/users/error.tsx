/**
 * Users Page Error Boundary
 * 
 * Catches errors specific to the admin users management page
 */

'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/admin/shared/error-fallback';

export default function UsersError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Users] Error:', error);
    }, [error]);

    return <ErrorFallback error={error} reset={reset} />;
}
