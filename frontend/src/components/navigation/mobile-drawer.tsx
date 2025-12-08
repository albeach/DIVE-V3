'use client';

/**
 * Mobile Drawer Menu - 2025 Compact Design
 * 
 * 🎨 INSTANCE-THEMED: Uses CSS variables from InstanceThemeProvider
 * ✅ Fixed glassmorphism issues - solid backgrounds for readability
 * ✅ Compact design - reduced padding and spacing
 */

import { X, LayoutGrid, FileText, Upload, Shield, Users, Settings, ShieldAlert, ScrollText, FileCheck, Key, CheckSquare, BookOpen, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { useInstanceTheme } from '@/components/ui/theme-provider';
import { InstanceFlag } from '@/components/ui/instance-hero-badge';

interface MobileDrawerProps {
    onClose: () => void;
    user: any;
}

export function MobileDrawer({ onClose, user }: MobileDrawerProps) {
    const pseudonym = getPseudonymFromUser(user);
    const isSuperAdmin = user?.roles?.includes('super_admin') || 
                         user?.roles?.includes('admin') || 
                         user?.roles?.includes('broker_super_admin') || false;
    const { instanceCode } = useInstanceTheme();
    
    // Clearance abbreviation
    const clearanceAbbrev = (level: string | null | undefined): string => {
        const l = (level || 'UNCLASSIFIED').toUpperCase();
        if (l === 'TOP_SECRET' || l === 'TOP SECRET') return 'TS';
        if (l === 'SECRET') return 'S';
        if (l === 'CONFIDENTIAL') return 'C';
        return 'U';
    };
    
    const primaryActions = [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
        { name: 'Documents', href: '/resources', icon: FileText },
        { name: 'Upload', href: '/upload', icon: Upload },
        ...(isSuperAdmin ? [{ name: 'Policy Tools', href: '/admin/opa-policy', icon: Shield }] : []),
    ];
    
    const adminItems = isSuperAdmin ? [
        { name: 'User Management', href: '/admin/users', icon: Users },
        { name: 'System Settings', href: '/admin/system', icon: Settings },
        { name: 'Security Dashboard', href: '/admin/security', icon: ShieldAlert },
        { name: 'SP Registry', href: '/admin/sp-registry', icon: FileCheck },
        { name: 'IdP Management', href: '/admin/idp', icon: Key },
        { name: 'Approvals', href: '/admin/approvals', icon: CheckSquare },
        { name: 'Audit Logs', href: '/admin/logs', icon: ScrollText },
        { name: 'Integration Guide', href: '/integration/federation-vs-object', icon: BookOpen },
    ] : [];
    
    return (
        <>
            {/* Backdrop - Darker overlay for better contrast */}
            <div 
                className="fixed inset-0 bg-black/70 z-[9998] animate-fade-in"
                onClick={onClose}
                role="presentation"
            />
            
            {/* Drawer - slides up from bottom with SOLID background */}
            <div 
                className="fixed inset-x-0 bottom-0 z-[9999] bg-white rounded-t-3xl max-h-[90vh] overflow-hidden border-t-2 border-gray-300"
                style={{ 
                    boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.25)'
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="More menu"
            >
                {/* Instance-themed top accent */}
                <div 
                    className="h-1"
                    style={{ background: 'var(--instance-banner-bg)' }}
                />
                
                {/* Handle bar */}
                <div className="flex justify-center pt-2 pb-1">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>
                
                {/* Compact Header - solid background */}
                <div className="flex items-center justify-between px-4 py-2 border-b-2 border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-3">
                        {/* Compact Avatar with Instance Flag */}
                        <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--instance-banner-bg)' }}
                        >
                            <span className="text-sm font-black text-white">
                                {(pseudonym || 'U').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 truncate">{pseudonym}</h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span 
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                                    style={{ 
                                        backgroundColor: 'rgba(var(--instance-primary-rgb), 0.1)',
                                        color: 'var(--instance-primary)'
                                    }}
                                >
                                    {clearanceAbbrev(user?.clearance)}
                                </span>
                                <span className="text-[10px] font-medium text-gray-500">
                                    {user?.countryOfAffiliation || 'USA'}
                                </span>
                                <InstanceFlag size={12} />
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
                    </button>
                </div>
                
                {/* Scrollable Menu Content */}
                <div 
                    className="overflow-y-auto"
                    style={{ maxHeight: 'calc(90vh - 140px)' }}
                >
                    {/* Quick Actions Section */}
                    <div className="py-2">
                        <div className="px-4 py-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                Quick Actions
                            </span>
                        </div>
                        <div className="px-4 grid grid-cols-2 gap-2">
                            {primaryActions.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 active:bg-gray-50 transition-colors"
                                >
                                    <item.icon 
                                        className="w-4 h-4 text-gray-400" 
                                        strokeWidth={2} 
                                    />
                                    <span className="text-[13px] font-medium text-gray-700 truncate">
                                        {item.name}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                    
                    {/* Admin Section - Only show if admin */}
                    {isSuperAdmin && (
                        <>
                            <div className="h-px bg-gray-100 mx-4" />
                            <div className="py-2">
                                <div className="px-4 py-1">
                                    <span 
                                        className="text-[10px] font-bold uppercase tracking-wider"
                                        style={{ color: 'var(--instance-primary)' }}
                                    >
                                        Admin Portal
                                    </span>
                                </div>
                                <div className="px-4 grid grid-cols-2 gap-2">
                                    {adminItems.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onClose}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 active:bg-gray-50 transition-colors"
                                        >
                                            <item.icon 
                                                className="w-4 h-4" 
                                                style={{ color: 'var(--instance-primary)' }}
                                                strokeWidth={2} 
                                            />
                                            <span className="text-[13px] font-medium text-gray-700 truncate">
                                                {item.name}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                {/* Fixed Footer with Sign Out - solid background */}
                <div 
                    className="border-t-2 border-gray-200 px-4 py-3 bg-gray-100"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
                >
                    <SecureLogoutButton />
                </div>
            </div>
        </>
    );
}
