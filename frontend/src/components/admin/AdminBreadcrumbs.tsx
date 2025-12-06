/**
 * Admin Breadcrumbs Component
 * 
 * Shows full navigation path with interactive links
 * Phase 1.3: Cross-Page Navigation
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';

// ============================================
// Types
// ============================================

interface IBreadcrumb {
    label: string;
    href: string;
    current?: boolean;
}

// ============================================
// Component
// ============================================

export default function AdminBreadcrumbs() {
    const pathname = usePathname();
    // Note: selectedIdPAlias from IdPManagementContext is only available in IdP pages
    // Use empty string as fallback for other admin pages
    const selectedIdPAlias = '';
    
    // Generate breadcrumbs from pathname
    const breadcrumbs: IBreadcrumb[] = React.useMemo(() => {
        const parts = pathname.split('/').filter(Boolean);
        const crumbs: IBreadcrumb[] = [];
        
        // Always start with Home
        crumbs.push({
            label: 'Home',
            href: '/'
        });
        
        // Build path incrementally
        let currentPath = '';
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath += `/${part}`;
            
            let label = part;
            
            // Beautify labels
            if (part === 'admin') {
                label = 'Admin';
            } else if (part === 'idp') {
                label = 'IdP Management';
            } else if (part === 'analytics') {
                label = 'IdP Governance';
            } else if (part === 'dashboard') {
                label = 'Dashboard';
            } else if (part === 'new') {
                label = 'Add New IdP';
            } else if (selectedIdPAlias && part === selectedIdPAlias) {
                label = selectedIdPAlias.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            } else {
                // Capitalize first letter
                label = part.charAt(0).toUpperCase() + part.slice(1);
            }
            
            crumbs.push({
                label,
                href: currentPath,
                current: i === parts.length - 1
            });
        }
        
        return crumbs;
    }, [pathname, selectedIdPAlias]);
    
    return (
        <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-2">
                {breadcrumbs.map((crumb, index) => (
                    <li key={crumb.href}>
                        <div className="flex items-center">
                            {index > 0 && (
                                <ChevronRightIcon 
                                    className="h-4 w-4 text-gray-400 dark:text-gray-600 mx-2" 
                                    aria-hidden="true" 
                                />
                            )}
                            {crumb.current ? (
                                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                    {crumb.label}
                                </span>
                            ) : (
                                <Link
                                    href={crumb.href}
                                    className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                >
                                    {index === 0 ? (
                                        <HomeIcon className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                        crumb.label
                                    )}
                                </Link>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

