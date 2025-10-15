/**
 * Breadcrumbs Component
 * 
 * Shows navigation hierarchy for nested pages
 * Example: Home / Resources / doc-ztdf-0001 / ZTDF Inspector
 */

'use client';

import Link from 'next/link';
import React from 'react';

export interface BreadcrumbItem {
    label: string;
    href: string | null; // null for current page (not clickable)
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
    // Don't render if no items
    if (!items || items.length === 0) {
        return null;
    }

    return (
        <nav className="bg-gray-100 border-b border-gray-200 py-2" aria-label="Breadcrumb">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <ol className="flex items-center space-x-2 text-sm overflow-x-auto">
                    {/* Home Link */}
                    <li className="flex items-center">
                        <Link 
                            href="/dashboard" 
                            className="text-blue-600 hover:text-blue-800 flex items-center transition-colors"
                        >
                            <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                            </svg>
                            Home
                        </Link>
                    </li>

                    {/* Breadcrumb Items */}
                    {items.map((item, index) => (
                        <li key={index} className="flex items-center whitespace-nowrap">
                            <svg 
                                className="flex-shrink-0 h-5 w-5 text-gray-400" 
                                fill="currentColor" 
                                viewBox="0 0 20 20"
                            >
                                <path 
                                    fillRule="evenodd" 
                                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" 
                                    clipRule="evenodd" 
                                />
                            </svg>
                            {item.href ? (
                                <Link 
                                    href={item.href} 
                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span className="text-gray-700 font-medium">
                                    {item.label}
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            </div>
        </nav>
    );
}



