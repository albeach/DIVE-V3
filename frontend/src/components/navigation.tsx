/**
 * Main Navigation Component
 * 
 * Streamlined 2025 navigation with dropdown menu:
 * - Clean, uncluttered design
 * - Admin dropdown for super_admin users
 * - Responsive mobile menu
 * - Active state indicators
 * - Accessible (ARIA labels, keyboard nav)
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { SessionStatusIndicator } from '@/components/auth/session-status-indicator';

interface INavigationProps {
    user: {
        uniqueID?: string | null;
        email?: string | null;
        clearance?: string | null;
        countryOfAffiliation?: string | null;
        roles?: string[];
    };
}

export default function Navigation({ user }: INavigationProps) {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isSuperAdmin = user.roles?.includes('super_admin');
    const isOnAdminPage = pathname.startsWith('/admin');

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setAdminDropdownOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const navItems = [
        { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
        { name: 'Documents', href: '/resources', icon: '📄' },
        { name: 'Policies', href: '/policies', icon: '📜' },
        { name: 'Upload', href: '/upload', icon: '📤' },
    ];

    const adminItems = [
        { name: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
        { name: 'IdP Management', href: '/admin/idp', icon: '🔐' },
        { name: 'Audit Logs', href: '/admin/logs', icon: '📜' },
        { name: 'Approvals', href: '/admin/approvals', icon: '✅' },
    ];

    const isActive = (href: string) => {
        if (href === '/dashboard') {
            return pathname === '/dashboard';
        }
        return pathname.startsWith(href);
    };

    return (
        <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Logo & Primary Nav */}
                    <div className="flex items-center">
                        {/* Logo */}
                        <Link href="/dashboard" className="flex-shrink-0 flex items-center">
                            <span className="text-xl font-bold text-blue-600">DIVE V3</span>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:ml-8 md:flex md:space-x-6">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                                        isActive(item.href)
                                            ? 'border-b-2 border-blue-500 text-gray-900'
                                            : 'text-gray-600 hover:text-gray-900 hover:border-b-2 hover:border-gray-300'
                                    }`}
                                >
                                    <span className="mr-1.5">{item.icon}</span>
                                    {item.name}
                                </Link>
                            ))}

                            {/* Admin Dropdown (Desktop) */}
                            {isSuperAdmin && (
                                <div className="relative" ref={dropdownRef}>
                                    <button
                                        onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                                        className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            isOnAdminPage
                                                ? 'bg-purple-100 text-purple-900'
                                                : 'text-purple-600 hover:bg-purple-50 hover:text-purple-900'
                                        }`}
                                        aria-expanded={adminDropdownOpen}
                                    >
                                        <span className="mr-1.5">👑</span>
                                        Admin
                                        <svg
                                            className={`ml-2 h-4 w-4 transition-transform ${adminDropdownOpen ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {adminDropdownOpen && (
                                        <div className="absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                                            <div className="py-1" role="menu">
                                                {adminItems.map((item) => (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setAdminDropdownOpen(false)}
                                                        className={`flex items-center px-4 py-2 text-sm ${
                                                            isActive(item.href)
                                                                ? 'bg-purple-50 text-purple-900 font-medium'
                                                                : 'text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                        role="menuitem"
                                                    >
                                                        <span className="mr-2">{item.icon}</span>
                                                        {item.name}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* User Info & Logout (Desktop) */}
                    <div className="hidden md:flex md:items-center md:space-x-3">
                        {/* Session Status Indicator */}
                        <SessionStatusIndicator />

                        {/* User Badge */}
                        <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">
                                {user.uniqueID || user.email}
                            </div>
                            <div className="text-xs text-gray-500">
                                {user.clearance} • {user.countryOfAffiliation}
                                {isSuperAdmin && <span className="ml-1 text-purple-600 font-semibold">• ADMIN</span>}
                            </div>
                        </div>

                        <SecureLogoutButton />
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center md:hidden">
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                            aria-expanded={mobileMenuOpen}
                        >
                            <span className="sr-only">Open main menu</span>
                            {mobileMenuOpen ? (
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-gray-200">
                    <div className="pt-2 pb-3 space-y-1">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`block pl-3 pr-4 py-2 text-base font-medium ${
                                    isActive(item.href)
                                        ? 'bg-blue-50 border-l-4 border-blue-500 text-blue-700'
                                        : 'border-l-4 border-transparent text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800'
                                }`}
                            >
                                <span className="mr-2">{item.icon}</span>
                                {item.name}
                            </Link>
                        ))}

                        {/* Admin Menu (Mobile) */}
                        {isSuperAdmin && (
                            <>
                                <div className="border-t border-gray-200 my-2"></div>
                                <div className="px-3 py-2 text-xs font-semibold text-purple-600 uppercase tracking-wide">
                                    Administrator
                                </div>
                                {adminItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block pl-3 pr-4 py-2 text-base font-medium ${
                                            isActive(item.href)
                                                ? 'bg-purple-50 border-l-4 border-purple-500 text-purple-700'
                                                : 'border-l-4 border-transparent text-purple-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-800'
                                        }`}
                                    >
                                        <span className="mr-2">{item.icon}</span>
                                        {item.name}
                                    </Link>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Mobile User Info */}
                    <div className="pt-4 pb-3 border-t border-gray-200">
                        <div className="px-4 mb-3">
                            <SessionStatusIndicator />
                        </div>
                        <div className="flex items-center px-4">
                            <div className="flex-1">
                                <div className="text-base font-medium text-gray-800">
                                    {user.uniqueID || user.email}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {user.clearance} • {user.countryOfAffiliation}
                                </div>
                                {isSuperAdmin && (
                                    <div className="text-xs text-purple-600 font-semibold mt-1">
                                        Super Administrator
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-3 px-4">
                            <SecureLogoutButton />
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}

