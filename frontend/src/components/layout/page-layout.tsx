/**
 * Page Layout Component
 *
 * Unified layout wrapper for all application pages
 * Includes: Navigation + Breadcrumbs + Main Content + Mobile Bottom Nav
 *
 * 🎨 INSTANCE-THEMED: Uses CSS variables from InstanceThemeProvider
 * for country-specific styling (USA, FRA, DEU, GBR, etc.)
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
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { MobileDrawer } from '@/components/navigation/mobile-drawer';
import { useInstanceTheme } from '@/components/ui/theme-provider';
import { InstanceFlag } from '@/components/ui/instance-hero-badge';

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
    /** Remove default padding for full-bleed page designs */
    noPadding?: boolean;
}

export default function PageLayout({
    user = {},
    breadcrumbs,
    children,
    maxWidth = '7xl',
    className = '',
    noPadding = false
}: PageLayoutProps) {
    const maxWidthClass = maxWidth === 'full' || noPadding ? '' : `max-w-${maxWidth} mx-auto`;
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const { instanceCode, instanceName } = useInstanceTheme();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24 lg:pb-0">
            {/* Skip to content - WCAG 2.1 AA */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
            >
                Skip to main content
            </a>

            {/* Instance-themed subtle background accent */}
            <div
                className="fixed top-0 left-0 right-0 h-1 z-[60]"
                style={{ background: 'var(--instance-banner-bg)' }}
                role="presentation"
            />

            {/* Navigation Bar */}
            <Navigation user={user} />

            {/* Breadcrumbs with instance accent (if provided) */}
            {/* SSOT: Use InteractiveBreadcrumbs for admin pages, fallback to static Breadcrumbs */}
            {typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? (
                <InteractiveBreadcrumbs />
            ) : breadcrumbs && breadcrumbs.length > 0 ? (
                <Breadcrumbs items={breadcrumbs} />
            ) : null}

            {/* Main Content */}
            <main
                id="main-content"
                role="main"
                className={`${maxWidthClass} ${noPadding ? '' : 'px-4 sm:px-6 lg:px-8 py-8'} ${className}`}
            >
                {children}
            </main>

            {/* Phase 2.2: Mobile Bottom Navigation Bar - Instance Themed */}
            <MobileBottomNav onMoreClick={() => setMobileDrawerOpen(true)} />

            {/* Phase 2.2: Mobile Drawer for "More" menu */}
            {mobileDrawerOpen && (
                <MobileDrawer onClose={() => setMobileDrawerOpen(false)} user={user} />
            )}
        </div>
    );
}
