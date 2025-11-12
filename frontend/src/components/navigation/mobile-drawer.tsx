'use client';

import { X, Settings, Star, Bell, HelpCircle, User, Users, ShieldAlert, ScrollText, FileCheck, Key, CheckSquare, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';

interface MobileDrawerProps {
    onClose: () => void;
    user: any;
}

export function MobileDrawer({ onClose, user }: MobileDrawerProps) {
    const pseudonym = getPseudonymFromUser(user);
    const isSuperAdmin = user?.roles?.includes('super_admin') || false;
    
    const menuItems = [
        { name: 'Saved Items', href: '/resources?filter=favorites', icon: Star },
        { name: 'Notifications', href: '/dashboard?view=notifications', icon: Bell },
        { name: 'Help & Support', href: '/help', icon: HelpCircle },
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
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in"
                onClick={onClose}
                role="presentation"
            />
            
            {/* Drawer - slides up from bottom */}
            <div 
                className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="More menu"
            >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">{pseudonym}</h2>
                        <p className="text-sm text-gray-600">{user?.clearance || 'UNCLASSIFIED'}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
                        aria-label="Close menu"
                    >
                        <X className="w-6 h-6 text-gray-600" />
                    </button>
                </div>
                
                {/* Menu Items */}
                <div className="p-4 space-y-1">
                    {menuItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onClose}
                            className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                            <item.icon className="w-6 h-6 text-gray-600" strokeWidth={2.5} />
                            <span className="text-base font-semibold text-gray-900">{item.name}</span>
                        </Link>
                    ))}
                    
                    {/* Admin Section */}
                    {isSuperAdmin && (
                        <>
                            <div className="py-3 px-4">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Admin</div>
                            </div>
                            {adminItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors"
                                >
                                    <item.icon className="w-6 h-6 text-red-600" strokeWidth={2.5} />
                                    <span className="text-base font-semibold text-red-900">{item.name}</span>
                                </Link>
                            ))}
                        </>
                    )}
                </div>
                
                {/* Footer */}
                <div className="border-t border-gray-200 p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
                    <SecureLogoutButton />
                </div>
            </div>
        </>
    );
}

