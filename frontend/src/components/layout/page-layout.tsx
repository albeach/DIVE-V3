/**
 * Page Layout Component
 * 
 * Unified layout wrapper for all application pages
 * Includes: Navigation + Breadcrumbs + Main Content + Mobile Bottom Nav
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

import React, { useState } from 'react';
import Navigation from '@/components/navigation';
import Breadcrumbs, { BreadcrumbItem } from './breadcrumbs';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { MobileDrawer } from '@/components/navigation/mobile-drawer';

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
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
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

            {/* Phase 2.2: Mobile Bottom Navigation Bar */}
            <MobileBottomNav onMoreClick={() => setMobileDrawerOpen(true)} />

            {/* Phase 2.2: Mobile Drawer for "More" menu */}
            {mobileDrawerOpen && (
                <MobileDrawer onClose={() => setMobileDrawerOpen(false)} user={user} />
            )}
        </div>
    );
}


