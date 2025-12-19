/**
 * IdP Admin Layout
 * 
 * Wraps IdP pages to handle client-side rendering
 */

import { Suspense } from 'react';

export default function IdPLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        }>
            {children}
        </Suspense>
    );
}
