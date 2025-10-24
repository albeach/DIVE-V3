/**
 * Premium Navigation Component - 2025 Design Evolution
 * 
 * Brand Colors:
 * - Primary: #4497ac (Teal Blue)
 * - Accent: #90d56a (Lime Green)
 * 
 * Features:
 * - Glassmorphism with enhanced backdrop blur
 * - Advanced micro-interactions and hover states
 * - Smooth animations with staggered effects
 * - Mega menu for complex navigation
 * - Gradient accents with dynamic effects
 * - 3D depth with layered shadows
 * - Active state with progress indicators
 * - Responsive mobile menu with slide animations
 * - Keyboard navigation support
 * - Enhanced accessibility (ARIA)
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { SessionStatusIndicator } from '@/components/auth/session-status-indicator';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { 
    LayoutDashboard, 
    FileText, 
    ScrollText, 
    CheckCircle2, 
    Upload,
    Library,
    Clock,
    Star,
    Shield,
    ShieldAlert,
    ShieldCheck,
    ShieldQuestion,
    ArrowUpCircle,
    Unlock,
    ChevronDown,
    Menu,
    X,
    User,
    LogOut,
    Settings,
    BarChart3,
    Key,
    CheckSquare,
    FileCheck,
    ArrowRight
} from 'lucide-react';

// National classification mappings (ACP-240 Section 4.3)
const NATIONAL_CLASSIFICATIONS: Record<string, Record<string, string>> = {
  'USA': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
  'GBR': { 'UNCLASSIFIED': 'OFFICIAL', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
  'FRA': { 'UNCLASSIFIED': 'NON CLASSIFIÉ', 'CONFIDENTIAL': 'CONFIDENTIEL DÉFENSE', 'SECRET': 'SECRET DÉFENSE', 'TOP_SECRET': 'TRÈS SECRET DÉFENSE' },
  'CAN': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
  'DEU': { 'UNCLASSIFIED': 'OFFEN', 'CONFIDENTIAL': 'VS-VERTRAULICH', 'SECRET': 'GEHEIM', 'TOP_SECRET': 'STRENG GEHEIM' },
  'AUS': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
  'NZL': { 'UNCLASSIFIED': 'UNCLASSIFIED', 'CONFIDENTIAL': 'CONFIDENTIAL', 'SECRET': 'SECRET', 'TOP_SECRET': 'TOP SECRET' },
  'ESP': { 'UNCLASSIFIED': 'NO CLASIFICADO', 'CONFIDENTIAL': 'CONFIDENCIAL', 'SECRET': 'SECRETO', 'TOP_SECRET': 'ALTO SECRETO' },
  'ITA': { 'UNCLASSIFIED': 'NON CLASSIFICATO', 'CONFIDENTIAL': 'CONFIDENZIALE', 'SECRET': 'SEGRETO', 'TOP_SECRET': 'SEGRETISSIMO' },
  'POL': { 'UNCLASSIFIED': 'NIEJAWNE', 'CONFIDENTIAL': 'POUFNE', 'SECRET': 'TAJNE', 'TOP_SECRET': 'ŚCIŚLE TAJNE' }
};

// Helper to get national classification label
function getNationalClearance(natoLevel: string | null | undefined, country: string | null | undefined): string {
  if (!natoLevel) return 'UNCLASS';
  if (!country) return natoLevel;
  return NATIONAL_CLASSIFICATIONS[country]?.[natoLevel] || natoLevel;
}

// Helper to get COUNTRY name from code
function getCountryName(code: string | null | undefined): string {
  const countryNames: Record<string, string> = {
    'USA': 'United States', 'GBR': 'United Kingdom', 'FRA': 'France', 'CAN': 'Canada',
    'DEU': 'Germany', 'AUS': 'Australia', 'NZL': 'New Zealand', 'ESP': 'Spain',
    'ITA': 'Italy', 'POL': 'Poland', 'NLD': 'Netherlands'
  };
  return countryNames[code || ''] || code || 'Unknown';
}

interface INavigationProps {
    user?: {
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
    const [megaMenuOpen, setMegaMenuOpen] = useState<string | null>(null);
    const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const megaMenuRef = useRef<HTMLDivElement>(null);
    const megaMenuTimeout = useRef<NodeJS.Timeout | null>(null);

    const isSuperAdmin = user?.roles?.includes('super_admin') || false;

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setAdminDropdownOpen(false);
            }
            if (megaMenuRef.current && !megaMenuRef.current.contains(event.target as Node)) {
                setMegaMenuOpen(null);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle mega menu with delay for better UX
    const handleMegaMenuEnter = useCallback((itemName: string) => {
        if (megaMenuTimeout.current) {
            clearTimeout(megaMenuTimeout.current);
        }
        setMegaMenuOpen(itemName);
    }, []);

    const handleMegaMenuLeave = useCallback(() => {
        megaMenuTimeout.current = setTimeout(() => {
            setMegaMenuOpen(null);
        }, 150); // Small delay before closing
    }, []);

    // Keyboard navigation support
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMobileMenuOpen(false);
                setAdminDropdownOpen(false);
                setMegaMenuOpen(null);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const navItems = [
        { 
            name: 'Dashboard', 
            href: '/dashboard', 
            icon: LayoutDashboard,
            description: 'Overview and quick stats',
            hasMegaMenu: false
        },
        { 
            name: 'Documents', 
            href: '/resources', 
            icon: FileText,
            description: 'Classified resource library',
            hasMegaMenu: true,
            megaMenuItems: [
                { 
                    category: 'Browse', 
                    items: [
                        { name: 'All Documents', href: '/resources', icon: Library },
                        { name: 'Recent', href: '/resources?sort=recent', icon: Clock },
                        { name: 'Favorites', href: '/resources?filter=favorites', icon: Star },
                    ]
                },
                { 
                    category: 'By Classification', 
                    items: [
                        { name: 'Top Secret', href: '/resources?classification=TOP_SECRET', icon: ShieldAlert, color: 'text-red-500' },
                        { name: 'Secret', href: '/resources?classification=SECRET', icon: Shield, color: 'text-orange-500' },
                        { name: 'Confidential', href: '/resources?classification=CONFIDENTIAL', icon: ShieldCheck, color: 'text-yellow-500' },
                        { name: 'Unclassified', href: '/resources?classification=UNCLASSIFIED', icon: ShieldQuestion, color: 'text-green-500' },
                    ]
                },
                { 
                    category: 'Actions', 
                    items: [
                        { name: 'Upload New', href: '/upload', icon: ArrowUpCircle },
                        { name: 'Request Access', href: '/resources/request', icon: Unlock },
                    ]
                }
            ]
        },
        { 
            name: 'Policies', 
            href: '/policies', 
            icon: ScrollText,
            description: 'Authorization policies',
            hasMegaMenu: false
        },
        { 
            name: 'Tests', 
            href: '/compliance', 
            icon: CheckCircle2,
            description: 'Compliance testing',
            hasMegaMenu: false
        },
        { 
            name: 'Upload', 
            href: '/upload', 
            icon: Upload,
            description: 'Upload new documents',
            hasMegaMenu: false
        },
    ];

    const adminItems = [
        { 
            name: 'Dashboard', 
            href: '/admin/dashboard', 
            icon: BarChart3, 
            badge: null,
            description: 'Admin overview'
        },
        { 
            name: 'Certificates', 
            href: '/admin/certificates', 
            icon: FileCheck, 
            badge: null,
            description: 'Manage PKI certs'
        },
        { 
            name: 'IdP Governance', 
            href: '/admin/analytics', 
            icon: Settings, 
            badge: null,
            description: 'Identity governance'
        },
        { 
            name: 'IdP Management', 
            href: '/admin/idp', 
            icon: Key, 
            badge: null,
            description: 'Configure identity providers'
        },
        { 
            name: 'Approvals', 
            href: '/admin/approvals', 
            icon: CheckSquare, 
            badge: '3',
            description: 'Pending approvals'
        },
        { 
            name: 'Audit Logs', 
            href: '/admin/logs', 
            icon: ScrollText, 
            badge: null,
            description: 'View audit trail'
        },
    ];

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    return (
        <>
            {/* Premium Glassmorphism Navbar */}
            <nav 
                className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-white/20 shadow-lg shadow-[#4497ac]/5"
                role="navigation"
                aria-label="Main navigation"
            >
                {/* Top accent line with animated gradient */}
                <div className="h-1 bg-gradient-to-r from-[#4497ac] via-[#90d56a] to-[#4497ac] bg-[length:200%_100%] animate-gradient" />
                
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-20">
                        {/* Left: Logo + Nav */}
                        <div className="flex items-center gap-8">
                            {/* Enhanced Logo with micro-interaction */}
                            <Link 
                                href="/dashboard" 
                                className="group flex items-center gap-3 transform transition-all duration-300 hover:scale-105"
                                aria-label="DIVE V3 Home"
                            >
                                <div className="relative">
                                    {/* Animated glow effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-xl opacity-0 group-hover:opacity-30 blur-xl transition-all duration-500" />
                                    
                                    {/* Logo container with enhanced shadow */}
                                    <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-lg shadow-[#4497ac]/30 transform group-hover:rotate-6 transition-all duration-500">
                                        <span className="text-2xl font-black text-white drop-shadow-lg">D</span>
                                        {/* Subtle shine effect */}
                                        <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                    </div>
                                </div>
                                
                                <div className="hidden xl:block">
                                    <div className="text-xl font-black bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">
                                        DIVE V3
                                    </div>
                                    <div className="text-[10px] font-semibold text-gray-500 tracking-wide uppercase">
                                        Coalition ICAM
                                    </div>
                                </div>
                            </Link>

                            {/* Desktop Navigation - Enhanced with tooltips and mega menu */}
                            <div className="hidden lg:flex lg:gap-1 lg:items-center">
                                {navItems.map((item, index) => {
                                    const active = isActive(item.href);
                                    const hasMenu = item.hasMegaMenu;
                                    const isMenuOpen = megaMenuOpen === item.name;
                                    
                                    return (
                                        <div 
                                            key={item.href}
                                            className="relative"
                                            onMouseEnter={() => {
                                                setHoveredNavItem(item.name);
                                                if (hasMenu) handleMegaMenuEnter(item.name);
                                            }}
                                            onMouseLeave={() => {
                                                setHoveredNavItem(null);
                                                if (hasMenu) handleMegaMenuLeave();
                                            }}
                                            style={{ animationDelay: `${index * 50}ms` }}
                                        >
                                            <Link
                                                href={item.href}
                                                className="group relative px-4 py-2.5 rounded-xl transition-all duration-300 block"
                                                aria-current={active ? 'page' : undefined}
                                            >
                                                {/* Enhanced hover background with gradient */}
                                                <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${
                                                    active 
                                                        ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm' 
                                                        : 'bg-gray-50/0 group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                                }`} />
                                                
                                                {/* Content with enhanced spacing */}
                                                <div className="relative flex items-center gap-2.5">
                                                    <item.icon className={`w-5 h-5 transition-all duration-300 ${
                                                        active 
                                                            ? 'scale-110 drop-shadow-md text-[#4497ac]' 
                                                            : 'text-gray-600 group-hover:scale-110 group-hover:drop-shadow-sm group-hover:text-[#4497ac]'
                                                    }`} strokeWidth={2.5} />
                                                    <span className={`font-bold text-sm transition-all duration-300 ${
                                                        active 
                                                            ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                            : 'text-gray-700 group-hover:text-gray-900'
                                                    }`}>
                                                        {item.name}
                                                    </span>
                                                    
                                                    {/* Dropdown indicator for mega menu */}
                                                    {hasMenu && (
                                                        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-300 ${
                                                            isMenuOpen ? 'rotate-180' : ''
                                                        }`} strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                
                                                {/* Active indicator with glow */}
                                                {active && (
                                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full shadow-lg shadow-[#4497ac]/50 animate-pulse" />
                                                )}
                                                
                                                {/* Tooltip on hover */}
                                                {hoveredNavItem === item.name && !active && (
                                                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-gray-900/95 backdrop-blur-sm text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap animate-fade-in z-50 pointer-events-none">
                                                        {item.description}
                                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900/95 rotate-45" />
                                                    </div>
                                                )}
                                            </Link>

                                            {/* Mega Menu - Enhanced with categories */}
                                            {hasMenu && isMenuOpen && item.megaMenuItems && (
                                                <div 
                                                    ref={megaMenuRef}
                                                    className="absolute top-full left-0 mt-3 min-w-[600px] origin-top animate-fade-in z-50"
                                                    onMouseEnter={() => handleMegaMenuEnter(item.name)}
                                                    onMouseLeave={handleMegaMenuLeave}
                                                >
                                                    {/* Glow effect */}
                                                    <div className="absolute -inset-2 bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 rounded-2xl opacity-50 blur-2xl" />
                                                    
                                                    {/* Menu container - FIXED GLASSMORPHISM */}
                                                    <div className="relative bg-white/[0.97] backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden">
                                                        {/* Solid background layer to prevent content bleed */}
                                                        <div className="absolute inset-0 bg-white/95 -z-10" />
                                                        
                                                        {/* Header with gradient */}
                                                        <div className="relative px-6 py-4 bg-gradient-to-r from-[#4497ac]/5 to-[#90d56a]/5 border-b border-gray-200">
                                                            <div className="flex items-center gap-3">
                                                                <item.icon className="w-6 h-6 text-[#4497ac]" strokeWidth={2.5} />
                                                                <div>
                                                                    <h3 className="font-bold text-gray-900 text-base">{item.name}</h3>
                                                                    <p className="text-xs text-gray-600">{item.description}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Menu grid */}
                                                        <div className="grid grid-cols-3 gap-6 p-6 relative bg-white/90">
                                                            {item.megaMenuItems.map((category, catIndex) => (
                                                                <div 
                                                                    key={category.category}
                                                                    className="animate-fade-in-up"
                                                                    style={{ animationDelay: `${catIndex * 75}ms` }}
                                                                >
                                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 px-1">
                                                                        {category.category}
                                                                    </h4>
                                                                    <div className="space-y-1">
                                                                        {category.items.map((subItem) => {
                                                                            const IconComponent = subItem.icon;
                                                                            const itemColor = (subItem as any).color;
                                                                            return (
                                                                                <Link
                                                                                    key={subItem.href}
                                                                                    href={subItem.href}
                                                                                    onClick={() => setMegaMenuOpen(null)}
                                                                                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-gradient-to-r hover:from-[#4497ac]/5 hover:to-[#90d56a]/5 hover:shadow-sm"
                                                                                >
                                                                                    <IconComponent 
                                                                                        className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                                                                                            itemColor || 'text-gray-500 group-hover:text-[#4497ac]'
                                                                                        }`}
                                                                                        strokeWidth={2.5}
                                                                                    />
                                                                                    <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors duration-200">
                                                                                        {subItem.name}
                                                                                    </span>
                                                                                    <ArrowRight className="w-3.5 h-3.5 ml-auto text-gray-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" strokeWidth={2} />
                                                                                </Link>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right: Unified Actions Menu - 2025 Pattern */}
                        <div className="flex items-center gap-3">
                            {/* Unified User + Admin Dropdown - Enhanced */}
                            <div ref={dropdownRef} className="hidden lg:block relative">
                                <button
                                    onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                                    className="group flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-gradient-to-r from-white/90 to-gray-50/90 border border-gray-100/80 shadow-sm hover:shadow-xl hover:border-[#4497ac]/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                                    aria-expanded={adminDropdownOpen}
                                    aria-haspopup="true"
                                >
                                    {/* Enhanced Avatar with ring effect */}
                                    <div className="relative">
                                        {/* Animated ring */}
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full opacity-0 group-hover:opacity-100 blur-sm animate-spin-slow transition-all duration-500" />
                                        
                                        <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-all duration-300">
                                            <span className="text-sm font-black text-white drop-shadow-md">
                                                {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        
                                        {/* Online indicator with pulse */}
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#90d56a] border-2 border-white rounded-full shadow-lg">
                                            <div className="absolute inset-0 bg-[#90d56a] rounded-full animate-ping opacity-75" />
                                        </div>
                                    </div>
                                    
                                    {/* User Info - Enhanced readability */}
                                    <div className="hidden xl:flex flex-col min-w-0 max-w-[200px] text-left">
                                        <span className="text-xs font-bold text-gray-900 leading-tight truncate">
                                            {getPseudonymFromUser(user as any)}
                                        </span>
                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 text-[#4497ac] border border-[#4497ac]/20" title={`Your Clearance: ${getNationalClearance(user?.clearance, user?.countryOfAffiliation)} (${getCountryName(user?.countryOfAffiliation)}) / ${user?.clearance || 'UNCLASSIFIED'} (NATO)`}>
                                                    {getNationalClearance(user?.clearance, user?.countryOfAffiliation)}
                                                </span>
                                                <span className="text-[10px] font-semibold text-gray-600">
                                                    {user?.countryOfAffiliation || 'USA'}
                                                </span>
                                            </div>
                                            {getNationalClearance(user?.clearance, user?.countryOfAffiliation) !== (user?.clearance || 'UNCLASS') && (
                                                <span className="text-[8px] text-gray-500 font-medium">
                                                    NATO: {user?.clearance || 'UNCLASSIFIED'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Dropdown Arrow with enhanced animation */}
                                    <svg className={`w-4 h-4 text-gray-500 transition-all duration-300 ${
                                        adminDropdownOpen ? 'rotate-180 text-[#4497ac]' : ''
                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Enhanced Unified Dropdown Menu */}
                                {adminDropdownOpen && (
                                    <div className="absolute top-full mt-3 right-0 w-80 origin-top-right animate-fade-in z-50">
                                        {/* Glow effect */}
                                        <div className="absolute -inset-2 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-2xl opacity-20 blur-xl" />
                                        
                                        <div className="relative bg-white/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-100/80 overflow-hidden">
                                            {/* User Info Header - Enhanced */}
                                            <div className="px-5 py-5 bg-gradient-to-r from-[#4497ac]/5 via-[#5ca3b5]/5 to-[#90d56a]/5 border-b border-gray-100">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-lg transform hover:rotate-6 transition-transform duration-300">
                                                            <span className="text-2xl font-black text-white drop-shadow-md">
                                                                {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        {/* Ring decoration */}
                                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full opacity-20 blur-md animate-pulse" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 truncate mb-1">
                                                            {getPseudonymFromUser(user as any)}
                                                        </p>
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 text-[#4497ac] border border-[#4497ac]/30 shadow-sm" title={`Your Clearance: ${getNationalClearance(user?.clearance, user?.countryOfAffiliation)} (${getCountryName(user?.countryOfAffiliation)})`}>
                                                                    {getNationalClearance(user?.clearance, user?.countryOfAffiliation)}
                                                                </span>
                                                                <span className="text-xs font-semibold text-gray-600 px-2 py-0.5 bg-gray-100 rounded-md">
                                                                    {user?.countryOfAffiliation || 'USA'}
                                                                </span>
                                                            </div>
                                                            {getNationalClearance(user?.clearance, user?.countryOfAffiliation) !== (user?.clearance || 'UNCLASSIFIED') && (
                                                                <p className="text-[10px] text-gray-600 flex items-center gap-1.5 bg-white/50 px-2 py-1 rounded">
                                                                    <span className="font-bold text-gray-500">NATO:</span> 
                                                                    <span className="font-medium">{user?.clearance || 'UNCLASSIFIED'}</span>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Enhanced Logout Button */}
                                                <SecureLogoutButton />
                                            </div>
                                            
                                            {/* Admin Section - Enhanced with descriptions */}
                                            {isSuperAdmin && (
                                                <>
                                                    <div className="px-5 py-3 bg-gradient-to-r from-gray-50/50 to-gray-100/30">
                                                        <p className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent flex items-center gap-2">
                                                            <User className="w-3.5 h-3.5 text-[#4497ac]" strokeWidth={2.5} />
                                                            Admin Portal
                                                        </p>
                                                    </div>
                                                    
                                                    <div className="py-1.5 px-2">
                                                        {adminItems.map((item, idx) => {
                                                            const active = isActive(item.href);
                                                            return (
                                                                <Link
                                                                    key={item.href}
                                                                    href={item.href}
                                                                    onClick={() => setAdminDropdownOpen(false)}
                                                                    className="group relative block px-3 py-3 rounded-xl transition-all duration-200 mb-0.5"
                                                                    style={{ animationDelay: `${idx * 30}ms` }}
                                                                >
                                                                    <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                                                        active
                                                                            ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm'
                                                                            : 'bg-transparent group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                                                    }`} />
                                                                    
                                                                    <div className="relative flex items-center justify-between">
                                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                            <item.icon className={`w-5 h-5 transition-all duration-200 ${
                                                                                active ? 'scale-110 drop-shadow-sm text-[#4497ac]' : 'text-gray-500 group-hover:scale-110 group-hover:text-[#4497ac]'
                                                                            }`} strokeWidth={2.5} />
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className={`font-bold text-sm transition-colors duration-200 flex items-center gap-2 ${
                                                                                    active
                                                                                        ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                                                        : 'text-gray-700 group-hover:text-gray-900'
                                                                                }`}>
                                                                                    {item.name}
                                                                                    {item.badge && (
                                                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                                            item.badge === 'New'
                                                                                                ? 'bg-gradient-to-r from-[#90d56a] to-emerald-400 text-white shadow-sm'
                                                                                                : 'bg-gradient-to-r from-[#4497ac] to-cyan-500 text-white shadow-sm'
                                                                                        } animate-pulse`}>
                                                                                            {item.badge}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-[10px] text-gray-500 mt-0.5">{item.description}</p>
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {/* Arrow indicator */}
                                                                        <ArrowRight 
                                                                            className={`w-4 h-4 text-gray-400 transition-all duration-200 ${
                                                                                active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                                                                            }`}
                                                                            strokeWidth={2}
                                                                        />
                                                                    </div>
                                                                    
                                                                    {active && (
                                                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#4497ac] to-[#90d56a] rounded-r-full shadow-lg shadow-[#4497ac]/50" />
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

                            {/* Mobile Menu Button - Enhanced */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="lg:hidden relative p-2.5 rounded-xl hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100/50 active:scale-95 transition-all duration-200 group"
                                aria-label="Toggle menu"
                                aria-expanded={mobileMenuOpen}
                            >
                                {/* Animated background */}
                                <div className="absolute inset-0 bg-gradient-to-r from-[#4497ac]/5 to-[#90d56a]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                
                                {mobileMenuOpen ? (
                                    <X className="relative w-6 h-6 text-gray-700 group-hover:text-[#4497ac] transition-colors duration-200" strokeWidth={2.5} />
                                ) : (
                                    <Menu className="relative w-6 h-6 text-gray-700 group-hover:text-[#4497ac] transition-colors duration-200" strokeWidth={2.5} />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Enhanced Mobile Menu - Slide Down Animation */}
            {mobileMenuOpen && (
                <div 
                    className="lg:hidden fixed inset-0 z-40 animate-fade-in" 
                    onClick={() => setMobileMenuOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Mobile menu"
                >
                    {/* Enhanced Backdrop with blur */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-transparent backdrop-blur-sm" />
                    
                    {/* Menu panel with enhanced styling */}
                    <div 
                        className="absolute top-[85px] left-0 right-0 bg-white/98 backdrop-blur-2xl border-b border-gray-200/80 shadow-2xl animate-slide-down max-h-[calc(100vh-85px)] overflow-y-auto" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-6 space-y-2 max-w-lg mx-auto">
                            {/* Mobile User Info Card - Enhanced */}
                            <div className="mb-5 p-5 rounded-2xl bg-gradient-to-br from-[#4497ac]/5 via-white to-[#90d56a]/5 border border-[#4497ac]/10 shadow-sm">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="relative">
                                        {/* Ring decoration */}
                                        <div className="absolute -inset-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full blur-md opacity-30 animate-pulse" />
                                        
                                        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#4497ac] via-[#5ca3b5] to-[#90d56a] flex items-center justify-center shadow-lg">
                                            <span className="text-2xl font-black text-white drop-shadow-md">
                                                {(getPseudonymFromUser(user as any) || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        
                                        {/* Online indicator */}
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#90d56a] border-3 border-white rounded-full shadow-lg">
                                            <div className="absolute inset-0 bg-[#90d56a] rounded-full animate-ping opacity-75" />
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-bold text-gray-900 truncate mb-1.5">
                                            {getPseudonymFromUser(user as any)}
                                        </p>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-gradient-to-r from-[#4497ac]/20 to-[#90d56a]/20 text-[#4497ac] border border-[#4497ac]/30 shadow-sm" title={`${getNationalClearance(user?.clearance, user?.countryOfAffiliation)} (${getCountryName(user?.countryOfAffiliation)})`}>
                                                    {getNationalClearance(user?.clearance, user?.countryOfAffiliation)}
                                                </span>
                                                <span className="text-xs font-semibold text-gray-600 px-2 py-0.5 bg-gray-100 rounded-md">
                                                    {user?.countryOfAffiliation || 'USA'}
                                                </span>
                                            </div>
                                            {getNationalClearance(user?.clearance, user?.countryOfAffiliation) !== (user?.clearance || 'UNCLASSIFIED') && (
                                                <p className="text-[10px] text-gray-600 flex items-center gap-1.5 bg-white/70 px-2 py-1 rounded">
                                                    <span className="font-bold text-gray-500">NATO:</span> 
                                                    <span className="font-medium">{user?.clearance || 'UNCLASSIFIED'}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Mobile Sign Out */}
                                <SecureLogoutButton />
                            </div>

                            {/* Navigation Items with staggered animation */}
                            <div className="space-y-1">
                                {navItems.map((item, idx) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setMobileMenuOpen(false)}
                                            className="group block relative px-4 py-4 rounded-xl transition-all duration-200 animate-fade-in-up"
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                                active
                                                    ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm border border-[#4497ac]/20'
                                                    : 'group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                            }`} />
                                            
                                            <div className="relative flex items-center gap-3.5">
                                                <item.icon className={`w-6 h-6 transition-all duration-200 ${
                                                    active ? 'scale-110 drop-shadow-sm text-[#4497ac]' : 'text-gray-600 group-hover:scale-110 group-hover:text-[#4497ac]'
                                                }`} strokeWidth={2.5} />
                                                <div className="flex-1">
                                                    <span className={`font-bold text-base block ${
                                                        active 
                                                            ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                            : 'text-gray-700 group-hover:text-gray-900'
                                                    }`}>
                                                        {item.name}
                                                    </span>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">{item.description}</p>
                                                </div>
                                                
                                                {/* Arrow indicator */}
                                                <ArrowRight 
                                                    className={`w-5 h-5 text-gray-400 transition-all duration-200 ${
                                                        active ? 'opacity-100' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                                                    }`}
                                                    strokeWidth={2}
                                                />
                                            </div>
                                            
                                            {active && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-gradient-to-br from-[#4497ac] to-[#90d56a] rounded-full shadow-lg animate-pulse" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>

                            {/* Admin Section in Mobile - Enhanced */}
                            {isSuperAdmin && (
                                <>
                                    <div className="my-6 flex items-center gap-3">
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 border border-[#4497ac]/20">
                                            <User className="w-3.5 h-3.5 text-[#4497ac]" strokeWidth={2.5} />
                                            <span className="text-xs font-black uppercase tracking-wider bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent">
                                                Admin Portal
                                            </span>
                                        </div>
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        {adminItems.map((item, idx) => {
                                            const active = isActive(item.href);
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={() => setMobileMenuOpen(false)}
                                                    className="group block relative px-4 py-4 rounded-xl transition-all duration-200 animate-fade-in-up"
                                                    style={{ animationDelay: `${(navItems.length + idx) * 50}ms` }}
                                                >
                                                    <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
                                                        active
                                                            ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 shadow-sm border border-[#4497ac]/20'
                                                            : 'group-hover:bg-gradient-to-r group-hover:from-gray-50 group-hover:to-gray-100/50'
                                                    }`} />
                                                    
                                                    <div className="relative flex items-center gap-3.5">
                                                        <item.icon className={`w-6 h-6 transition-all duration-200 ${
                                                            active ? 'scale-110 drop-shadow-sm text-[#4497ac]' : 'text-gray-600 group-hover:scale-110 group-hover:text-[#4497ac]'
                                                        }`} strokeWidth={2.5} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-bold text-base ${
                                                                    active 
                                                                        ? 'bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent'
                                                                        : 'text-gray-700 group-hover:text-gray-900'
                                                                }`}>
                                                                    {item.name}
                                                                </span>
                                                                {item.badge && (
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold shadow-md ${
                                                                        item.badge === 'New'
                                                                            ? 'bg-gradient-to-r from-[#90d56a] to-emerald-400 text-white'
                                                                            : 'bg-gradient-to-r from-[#4497ac] to-cyan-500 text-white'
                                                                    } animate-pulse`}>
                                                                        {item.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-500 mt-0.5">{item.description}</p>
                                                        </div>
                                                        
                                                        {/* Arrow indicator */}
                                                        <ArrowRight 
                                                            className={`w-5 h-5 text-gray-400 transition-all duration-200 ${
                                                                active ? 'opacity-100' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'
                                                            }`}
                                                            strokeWidth={2}
                                                        />
                                                    </div>
                                                    
                                                    {active && (
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-gradient-to-br from-[#4497ac] to-[#90d56a] rounded-full shadow-lg animate-pulse" />
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
