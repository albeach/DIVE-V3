/**
 * Page Layout Component
 * 
 * Unified layout wrapper for all application pages
 * Includes: Navigation + Breadcrumbs + Main Content
 * 
 * Usage:
 * ```tsx
 * <PageLayout 
 *   user={session.user} 
 *   breadcrumbs={[{ label: 'Resources', href: '/resources' }]}
 * >
 *   <YourPageContent />
 * </PageLayout>
 * ```
 */

'use client';

import React from 'react';
import Navigation from '@/components/navigation';
import Breadcrumbs, { BreadcrumbItem } from './breadcrumbs';

interface PageLayoutProps {
    user?: {
        uniqueID?: string | null;
        email?: string | null;
        clearance?: string | null;
        countryOfAffiliation?: string | null;
        roles?: string[];
    };
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
    className?: string;
}

export default function PageLayout({ 
    user = {}, 
    breadcrumbs, 
    children, 
    maxWidth = '7xl',
    className = ''
}: PageLayoutProps) {
    const maxWidthClass = maxWidth === 'full' ? '' : `max-w-${maxWidth} mx-auto`;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navigation Bar */}
            <Navigation user={user} />

            {/* Breadcrumbs (if provided) */}
            {breadcrumbs && breadcrumbs.length > 0 && (
                <Breadcrumbs items={breadcrumbs} />
            )}

            {/* Main Content */}
            <main className={`${maxWidthClass} px-4 sm:px-6 lg:px-8 py-8 ${className}`}>
                {children}
            </main>
        </div>
    );
}



