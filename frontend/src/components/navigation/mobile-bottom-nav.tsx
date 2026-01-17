'use client';

/**
 * Mobile Bottom Navigation
 * 
 * 🎨 INSTANCE-THEMED: Uses CSS variables from InstanceThemeProvider
 * for country-specific styling (USA, FRA, DEU, GBR, etc.)
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, FileText, Upload, Shield, MoreHorizontal } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
    const pathname = usePathname();
    const { t } = useTranslation('nav');

    const tabs = [
        { icon: Home, label: t('nav.home'), href: '/dashboard' },
        { icon: FileText, label: t('nav.docs'), href: '/resources' },
        { icon: Upload, label: t('nav.upload.shortName'), href: '/upload' },
        { icon: Shield, label: t('nav.policyTools.shortName'), href: '/policies' },
        { icon: MoreHorizontal, label: t('nav.more'), href: '#', onClick: onMoreClick },
    ];
    
    return (
        <nav 
            className="lg:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t-2 border-gray-300"
            style={{ 
                paddingBottom: 'env(safe-area-inset-bottom)',
                boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)'
            }}
            role="navigation"
            aria-label="Mobile navigation"
        >
            {/* Instance-themed top accent line */}
            <div 
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: 'var(--instance-banner-bg)' }}
            />
            
            <div className="grid grid-cols-5 gap-1 px-2 py-2 bg-white">
                {tabs.map((tab) => {
                    const isActive = pathname === tab.href || (tab.href === '/dashboard' && pathname === '/');
                    const Icon = tab.icon;
                    
                    const handleClick = (e: React.MouseEvent) => {
                        if (tab.onClick) {
                            e.preventDefault();
                            tab.onClick();
                        }
                    };
                    
                    return (
                        <Link
                            key={tab.label}
                            href={tab.href}
                            onClick={handleClick}
                            className={`relative flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl transition-all duration-200 min-h-[60px] ${
                                isActive 
                                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                                    : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                            }`}
                            style={isActive ? {
                                background: 'linear-gradient(to right, rgba(var(--instance-primary-rgb), 0.15), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.15))',
                                color: 'var(--instance-primary)'
                            } : undefined}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={tab.label}
                        >
                            {/* Active indicator - top bar with instance gradient */}
                            {isActive && (
                                <div 
                                    className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-b-full"
                                    style={{ background: 'var(--instance-banner-bg)' }}
                                />
                            )}
                            
                            <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                            <span className={`text-[11px] font-bold leading-tight ${isActive ? '' : 'text-gray-600'}`}>{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
