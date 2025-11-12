'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, FileText, Upload, Shield, MoreHorizontal } from 'lucide-react';

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
    const pathname = usePathname();
    
    const tabs = [
        { icon: Home, label: 'Home', href: '/dashboard' },
        { icon: FileText, label: 'Docs', href: '/resources' },
        { icon: Upload, label: 'Upload', href: '/upload' },
        { icon: Shield, label: 'Policy', href: '/policies' },
        { icon: MoreHorizontal, label: 'More', href: '#', onClick: onMoreClick },
    ];
    
    return (
        <nav 
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/98 backdrop-blur-xl border-t border-gray-200 shadow-lg"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}  // iPhone notch support
            role="navigation"
            aria-label="Mobile navigation"
        >
            <div className="grid grid-cols-5 gap-1 px-2 py-2">
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
                            className={`relative flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl transition-all duration-200 min-h-[56px] ${
                                isActive 
                                    ? 'bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 text-[#4497ac]'
                                    : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={tab.label}
                        >
                            {/* Active indicator - top bar */}
                            {isActive && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-b-full" />
                            )}
                            
                            <Icon className="w-6 h-6" strokeWidth={2.5} />
                            <span className="text-[10px] font-bold leading-tight">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

