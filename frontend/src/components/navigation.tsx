/**
 * Premium Navigation Component - 2025 Design
 * 
 * Brand Colors:
 * - Primary: #4497ac (Teal Blue)
 * - Accent: #90d56a (Lime Green)
 * 
 * Features:
 * - Glassmorphism with backdrop blur
 * - Micro-interactions on every element
 * - Smooth animations (300-500ms)
 * - Gradient accents
 * - 3D depth with shadows
 * - Active state indicators
 * - Responsive mobile menu
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { SessionStatusIndicator } from '@/components/auth/session-status-indicator';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';

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
        { name: 'Tests', href: '/compliance', icon: '✅' },
        { name: 'Upload', href: '/upload', icon: '📤' },
    ];

    const adminItems = [
        { name: 'Dashboard', href: '/admin/dashboard', icon: '📊', badge: null },
        { name: 'IdP Governance', href: '/admin/analytics', icon: '🏛️', badge: null },
        { name: 'IdP Management', href: '/admin/idp', icon: '🔐', badge: null },
        { name: 'Approvals', href: '/admin/approvals', icon: '✅', badge: '3' },
        { name: 'Audit Logs', href: '/admin/logs', icon: '📋', badge: null },
    ];

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* Premium Glassmorphism Navbar */}
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-white/20 shadow-lg shadow-[#4497ac]/5">
                {/* Top accent line with brand gradient */}
                <div className="h-1 bg-gradient-to-r from-[#4497ac] via-[#90d56a] to-[#4497ac] bg-[length:200%_100%] animate-gradient" />
                
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-20">
                        {/* Left: Logo + Nav */}
                        <div className="flex items-center gap-6">
                            {/* Compact Logo with micro-interaction */}
                            <Link 
                                href="/dashboard" 
                                className="group flex items-center gap-3 transform transition-all duration-300 hover:scale-105"
                            >
                                <div className="relative">
                                    {/* Animated glow */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-xl opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300" />
                                    
                                    {/* Logo container */}
                                    <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#4497ac] to-[#90d56a] flex items-center justify-center shadow-lg shadow-[#4497ac]/30 transform group-hover:rotate-3 transition-transform duration-300">
                                        <span className="text-2xl font-black text-white">D</span>
                                    </div>
                                </div>
                                
                                <div className="hidden xl:block">
                                    <div className="text-xl font-black bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent">
                                        DIVE V3
                                    </div>
                                    <div className="text-[10px] font-semibold text-gray-500 tracking-wide uppercase">
                                        Coalition ICAM
                                    </div>
                                </div>
                            </Link>

                            {/* Desktop Navigation - Icon + Text */}
                            <div className="hidden lg:flex lg:gap-1">
                                {navItems.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="group relative px-3 py-2 rounded-lg transition-all duration-300"
                                        >
                                            {/* Hover background */}
                                            <div className={`absolute inset-0 rounded-lg transition-all duration-300 ${
                                                active 
                                                    ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10' 
                                                    : 'bg-gray-100/0 group-hover:bg-gray-100'
                                            }`} />
                                            
                                            {/* Content */}
                                            <div className="relative flex items-center gap-2">
                                                <span className={`text-lg transition-transform duration-300 ${
                                                    active ? 'scale-110' : 'group-hover:scale-110'
                                                }`}>
                                                    {item.icon}
                                                </span>
                                                <span className={`font-semibold text-sm transition-colors duration-300 ${
                                                    active 
                                                        ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                        : 'text-gray-700 group-hover:text-gray-900'
                                                }`}>
                                                    {item.name}
                                                </span>
                                            </div>
                                            
                                            {/* Active indicator */}
                                            {active && (
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full shadow-lg shadow-[#4497ac]/50" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: Unified Actions Menu - 2025 Pattern */}
                        <div className="flex items-center gap-2">
                            {/* Unified User + Admin Dropdown */}
                            <div ref={dropdownRef} className="hidden lg:block relative">
                                <button
                                    onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                                    className="group flex items-center gap-2.5 pl-3 pr-3.5 py-2 rounded-xl bg-gradient-to-r from-white/80 to-gray-50/80 border border-gray-100/50 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
                                >
                                    {/* Compact Avatar */}
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full opacity-0 group-hover:opacity-100 blur-md transition-all duration-500" />
                                        <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-[#4497ac] to-[#90d56a] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-all duration-300">
                                            <span className="text-sm font-black text-white drop-shadow-md">
                                                {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#90d56a] border-2 border-white rounded-full shadow-lg">
                                            <div className="absolute inset-0 bg-[#90d56a] rounded-full animate-ping opacity-75" />
                                        </div>
                                    </div>
                                    
                                    {/* User Info - More compact */}
                                    <div className="hidden xl:flex flex-col min-w-0 max-w-[140px]">
                                        <span className="text-xs font-bold text-gray-900 leading-tight truncate">
                                            {getPseudonymFromUser(user as any)}
                                        </span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 text-[#4497ac]">
                                                {user.clearance || 'UNCLASS'}
                                            </span>
                                            <span className="text-[10px] font-medium text-gray-600">
                                                {user.countryOfAffiliation || 'USA'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Dropdown Arrow */}
                                    <svg className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${
                                        adminDropdownOpen ? 'rotate-180' : ''
                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Unified Dropdown Menu */}
                                {adminDropdownOpen && (
                                    <div className="absolute top-full mt-2 right-0 w-72 origin-top-right animate-fade-in z-50">
                                        <div className="absolute -inset-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-2xl opacity-20 blur-xl" />
                                        
                                        <div className="relative bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                            {/* User Info Header */}
                                            <div className="px-4 py-4 bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 border-b border-gray-100">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-[#4497ac] to-[#90d56a] flex items-center justify-center shadow-lg">
                                                        <span className="text-xl font-black text-white drop-shadow-md">
                                                            {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 truncate">
                                                            {getPseudonymFromUser(user as any)}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 text-[#4497ac] border border-[#4497ac]/30">
                                                                {user.clearance || 'UNCLASSIFIED'}
                                                            </span>
                                                            <span className="text-xs font-medium text-gray-600">
                                                                {user.countryOfAffiliation || 'USA'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Logout Button */}
                                                <SecureLogoutButton />
                                            </div>
                                            
                                            {/* Admin Section - Only if super admin */}
                                            {isSuperAdmin && (
                                                <>
                                                    <div className="px-4 py-2 bg-gray-50/50">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent">
                                                            Admin Portal
                                                        </p>
                                                    </div>
                                                    
                                                    <div className="py-1">
                                                        {adminItems.map((item, idx) => {
                                                            const active = isActive(item.href);
                                                            return (
                                                                <Link
                                                                    key={item.href}
                                                                    href={item.href}
                                                                    onClick={() => setAdminDropdownOpen(false)}
                                                                    className="group relative block px-4 py-2.5 transition-all duration-200"
                                                                >
                                                                    <div className={`absolute inset-0 transition-all duration-200 ${
                                                                        active
                                                                            ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10'
                                                                            : 'bg-transparent group-hover:bg-gray-50'
                                                                    }`} />
                                                                    
                                                                    <div className="relative flex items-center justify-between">
                                                                        <div className="flex items-center gap-2.5">
                                                                            <span className={`text-lg transition-transform duration-200 ${
                                                                                active ? 'scale-110' : 'group-hover:scale-110'
                                                                            }`}>
                                                                                {item.icon}
                                                                            </span>
                                                                            <span className={`font-semibold text-sm transition-colors duration-200 ${
                                                                                active
                                                                                    ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                                                    : 'text-gray-700 group-hover:text-gray-900'
                                                                            }`}>
                                                                                {item.name}
                                                                            </span>
                                                                        </div>
                                                                        
                                                                        {item.badge && (
                                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                                item.badge === 'New'
                                                                                    ? 'bg-gradient-to-r from-[#90d56a] to-emerald-400 text-white shadow-md'
                                                                                    : 'bg-gradient-to-r from-[#4497ac] to-cyan-500 text-white shadow-md'
                                                                            } animate-pulse`}>
                                                                                {item.badge}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {active && (
                                                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-[#4497ac] to-[#90d56a] rounded-r-full shadow-lg shadow-[#4497ac]/50" />
                                                                    )}
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="lg:hidden relative p-2.5 rounded-xl hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 active:scale-95 transition-all duration-200 group"
                                aria-label="Toggle menu"
                            >
                                <svg className="w-6 h-6 text-gray-700 group-hover:text-[#4497ac] transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu - Enhanced Slide Down Animation */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-40 animate-fade-in" onClick={() => setMobileMenuOpen(false)}>
                    {/* Backdrop with blur */}
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
                    
                    {/* Menu panel */}
                    <div className="absolute top-[85px] left-0 right-0 bg-white/98 backdrop-blur-xl border-b border-gray-200 shadow-2xl animate-slide-down max-h-[calc(100vh-85px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-6 space-y-1 max-w-lg mx-auto">
                            {/* Mobile User Info Card */}
                            <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-[#4497ac]/5 to-[#90d56a]/5 border border-[#4497ac]/10">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-lg">
                                            <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-[#4497ac] to-[#90d56a] flex items-center justify-center">
                                                <span className="text-xl font-black text-white drop-shadow-md">
                                                    {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#90d56a] border-2 border-white rounded-full shadow-lg">
                                            <div className="absolute inset-0 bg-[#90d56a] rounded-full animate-ping opacity-75" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-bold text-gray-900 truncate">
                                            {getPseudonymFromUser(user as any)}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 text-[#4497ac] border border-[#4497ac]/30">
                                                {user.clearance || 'UNCLASSIFIED'}
                                            </span>
                                            <span className="text-xs font-medium text-gray-600">
                                                {user.countryOfAffiliation || 'USA'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {/* Mobile Sign Out */}
                                <SecureLogoutButton />
                            </div>

                            {/* Navigation Items */}
                            {navItems.map((item, idx) => {
                                const active = isActive(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="group block relative px-4 py-3.5 rounded-xl transition-all duration-200"
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                            active
                                                ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm'
                                                : 'group-hover:bg-gray-50'
                                        }`} />
                                        
                                        <div className="relative flex items-center gap-3">
                                            <span className={`text-2xl transition-transform duration-200 ${
                                                active ? 'scale-110' : 'group-hover:scale-110'
                                            }`}>{item.icon}</span>
                                            <span className={`font-semibold text-base ${
                                                active 
                                                    ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                    : 'text-gray-700 group-hover:text-gray-900'
                                            }`}>
                                                {item.name}
                                            </span>
                                        </div>
                                        
                                        {active && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-gradient-to-br from-[#4497ac] to-[#90d56a] rounded-full shadow-lg" />
                                        )}
                                    </Link>
                                );
                            })}

                            {/* Admin Section in Mobile */}
                            {isSuperAdmin && (
                                <>
                                    <div className="my-4 flex items-center gap-3">
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Admin Portal</span>
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                    </div>
                                    {adminItems.map((item, idx) => {
                                        const active = isActive(item.href);
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="group block relative px-4 py-3.5 rounded-xl transition-all duration-200"
                                            >
                                                <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                                    active
                                                        ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm'
                                                        : 'group-hover:bg-gray-50'
                                                }`} />
                                                
                                                <div className="relative flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-2xl transition-transform duration-200 ${
                                                            active ? 'scale-110' : 'group-hover:scale-110'
                                                        }`}>{item.icon}</span>
                                                        <span className={`font-semibold text-base ${
                                                            active 
                                                                ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                                : 'text-gray-700 group-hover:text-gray-900'
                                                        }`}>
                                                            {item.name}
                                                        </span>
                                                    </div>
                                                    {item.badge && (
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold shadow-md ${
                                                            item.badge === 'New'
                                                                ? 'bg-gradient-to-r from-[#90d56a] to-emerald-400 text-white'
                                                                : 'bg-gradient-to-r from-[#4497ac] to-cyan-500 text-white'
                                                        }`}>
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {active && (
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-gradient-to-br from-[#4497ac] to-[#90d56a] rounded-full shadow-lg" />
                                                )}
                                            </Link>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
